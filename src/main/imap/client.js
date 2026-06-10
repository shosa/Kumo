import { ImapFlow } from 'imapflow'
import { EventEmitter } from 'events'
import { simpleParser } from 'mailparser'
import { logSync, logMail, logMove, logDelete, logInfo, logWarn, logErr } from '../logger.js'
import {
  upsertMessage,
  upsertFolder,
  updateFolderCounts,
  getFolders,
  saveMessageBody,
  getMessageBody,
  removeMessages,
  getLocalUids,
  getPendingLocalUids,
  updateMessageFlags,
  toggleMessageFlag,
  getSyncState,
  upsertSyncState,
  upsertAttachmentMeta,
  getAttachmentsMeta,
  updateMessageSnippet,
  upsertRemoteDraft,
  reconcileRemoteDrafts
} from '../store/db.js'
import { getServerOrphanUids } from '../optimisticMove.js'
import { buildRawEmail } from '../smtp/index.js'
import { parseICalEvents } from '../caldav/client.js'

const IMAP_HOST = 'imap.mail.me.com'
const IMAP_PORT = 993

const SPECIAL_USE_MAP = {
  '\\Inbox': 'INBOX',
  '\\Sent': 'Sent',
  '\\Drafts': 'Drafts',
  '\\Trash': 'Deleted Messages',
  '\\Junk': 'Junk',
  '\\Archive': 'Archive'
}

function makeClient(email, password) {
  return new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }
  })
}

function parseAddress(addr) {
  if (!addr) return ''
  if (typeof addr === 'string') return addr
  if (addr.text) return addr.text
  if (Array.isArray(addr)) return addr.map(a => a.text || a.address || '').join(', ')
  return addr.address || ''
}

function parseAddressList(addr) {
  if (!addr) return []
  const list = Array.isArray(addr) ? addr : [addr]
  return list.map(a => ({ name: a.name || '', email: a.address || '' }))
}

function extractSnippet(text, html) {
  if (text) return text.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  }
  return ''
}

function computeThreadId(messageId, inReplyTo, references) {
  if (references) {
    const ids = references.trim().split(/\s+/).filter(Boolean)
    if (ids.length > 0) return ids[0]
  }
  if (inReplyTo) return inReplyTo.trim()
  return messageId || null
}

export class ImapClient extends EventEmitter {
  constructor(email, password) {
    super()
    this.email = email
    this.password = password
    this.client = null
    this.idleClient = null
    this.connected = false
    this.reconnectTimer = null
    this.reconnectDelay = 5000
    this.idleFolder = 'INBOX'
    this.syncTimer = null
    this._idleLock = null
    this._syncInFlight = new Map()  // folder → Promise (dedup concurrent syncs)
    this._lastSyncTime = new Map()  // folder → timestamp
  }

  // ── Connection ────────────────────────────────────────────────────────────

  async connect() {
    logInfo('IMAP connecting', { account: this.email })
    this.emit('connection-status', 'connecting')
    this.client = makeClient(this.email, this.password)

    this.client.on('error', (err) => {
      logErr(`IMAP error: ${err.message}`)
      this._scheduleReconnect()
    })

    await this.client.connect()
    this.connected = true
    this.reconnectDelay = 5000
    logInfo('IMAP connected', { account: this.email })
    await this._syncFolders()
    await this._syncFolder('INBOX', true)
    await this.syncDrafts().catch(err => {
      logWarn('IMAP draft sync failed', { account: this.email, error: err.message })
    })
    await this._startIdle()
    this.emit('connection-status', 'connected')
  }

  async disconnect() {
    this.connected = false
    clearTimeout(this.reconnectTimer)
    clearInterval(this.syncTimer)

    try { this._idleLock?.release() } catch { /* ignore */ }
    try { await this.idleClient?.logout() } catch { /* ignore */ }
    try { await this.client?.logout() } catch { /* ignore */ }

    this._idleLock = null
    this.idleClient = null
    this.client = null
    this.emit('connection-status', 'disconnected')
  }

  _scheduleReconnect() {
    if (!this.connected) return
    this.emit('connection-status', 'reconnecting')
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect()
      } catch (err) {
        logErr('IMAP reconnect failed', {
          account: this.email,
          delayMs: this.reconnectDelay,
          error: err.message
        })
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000)
        this._scheduleReconnect()
      }
    }, this.reconnectDelay)
  }

  // ── IDLE (push) ───────────────────────────────────────────────────────────

  async _startIdle() {
    try {
      this.idleClient = makeClient(this.email, this.password)
      await this.idleClient.connect()

      this.idleClient.on('exists', async (data) => {
        const { count, prevCount } = data
        if (count > prevCount) {
          await this._fetchNewMessages(this.idleFolder, prevCount, count).catch(err => {
            logErr('IMAP IDLE new-message fetch failed', {
              folder: this.idleFolder,
              error: err.message
            })
          })
        }
      })

      this.idleClient.on('expunge', () => {
        // Debounce multiple rapid expunges into a single reconciliation sync
        clearTimeout(this._expungeTimer)
        this._expungeTimer = setTimeout(async () => {
          await this._syncFolder(this.idleFolder, true).catch(err => {
            logErr('IMAP expunge reconciliation failed', {
              folder: this.idleFolder,
              error: err.message
            })
          })
        }, 800)
      })

      this.idleClient.on('flags', async (data) => {
        await this._syncFolderCounts(this.idleFolder).catch(err => {
          logWarn('IMAP IDLE folder-count refresh failed', {
            folder: this.idleFolder,
            error: err.message
          })
        })
        // Update specific message flags if the event carries uid/flags info
        if (data?.uid) {
          const flags = data.flags
            ? (Array.isArray(data.flags) ? data.flags : [...(data.flags || [])])
            : null
          if (flags) {
            updateMessageFlags(this.idleFolder, data.uid, flags)
            this.emit('flags-updated', { folder: this.idleFolder, uid: data.uid, flags })
          }
        }
      })

      this.idleClient.on('error', (err) => {
        if (this.connected) {
          logWarn('IMAP IDLE client error', {
            folder: this.idleFolder,
            error: err.message
          })
        }
      })

      const lock = await this.idleClient.getMailboxLock(this.idleFolder)
      this._idleLock = lock

      const keepIdling = async () => {
        while (this.connected) {
          try {
            await this.idleClient.idle()
          } catch (err) {
            if (!this.connected) break
            logWarn('IMAP IDLE loop interrupted', {
              folder: this.idleFolder,
              error: err.message
            })
            await new Promise(r => setTimeout(r, 5000))
            if (!this.connected || !this.idleClient?.usable) break
          }
        }
        lock.release()
        this._idleLock = null
        if (this.connected) this._scheduleReconnect()
      }
      keepIdling().catch(err => {
        logErr('IMAP IDLE loop failed', {
          folder: this.idleFolder,
          error: err.message
        })
      })
    } catch (err) {
      logWarn('IMAP IDLE unavailable; switching to polling', {
        folder: this.idleFolder,
        intervalMs: 120000,
        error: err.message
      })
      this.syncTimer = setInterval(() => this.syncInbox(), 120000)
    }
  }

  async _fetchNewMessages(folder, prevCount, newCount) {
    if (!this.client) return
    logMail(`IDLE detected new messages`, { folder, count: newCount - prevCount })
    const lock = await this.client.getMailboxLock(folder)
    try {
      const syncState = getSyncState(this.email, folder)
      const lastUid   = syncState?.last_uid || 0
      const uids      = lastUid > 0
        ? await this.client.search({ uid: `${lastUid + 1}:*` }, { uid: true })
        : []

      if (!uids?.length) return

      let maxUid = lastUid
      let fetched = 0
      for await (const msg of this.client.fetch(uids, {
        envelope: true, flags: true, bodyStructure: true, size: true
      }, { uid: true })) {
        this._persistEnvelope(msg, folder)
        if (msg.uid > maxUid) maxUid = msg.uid
        fetched++

        if (!msg.flags?.has('\\Seen')) {
          this.emit('new-mail', {
            subject: msg.envelope.subject || '(No subject)',
            from:    msg.envelope.from?.[0]?.name || msg.envelope.from?.[0]?.address || '',
            folder,
            uid:     msg.uid
          })
        }
      }
      if (fetched) logMail('IDLE fetched new messages', { folder, count: fetched })
      if (maxUid > lastUid) upsertSyncState(this.email, folder, maxUid, newCount)
    } finally {
      lock.release()
    }
    await this._syncFolderCounts(folder)
  }

  // ── Folder management ─────────────────────────────────────────────────────

  async _syncFolders() {
    const tree = await this.client.listTree()
    this._walkFolderTree(tree.folders)
  }

  _walkFolderTree(folders) {
    for (const f of folders || []) {
      const specialUse = f.specialUse || this._guessSpecialUse(f.path)
      upsertFolder({
        path: f.path,
        name: f.name,
        delimiter: f.delimiter,
        special_use: specialUse,
        flags: [...(f.flags || [])],
        unread_count: 0,
        total_count: 0
      })
      if (f.folders?.length) this._walkFolderTree(f.folders)
    }
  }

  _guessSpecialUse(path) {
    const p = path.toLowerCase()
    if (p === 'inbox') return '\\Inbox'
    if (p.includes('sent')) return '\\Sent'
    if (p.includes('draft')) return '\\Drafts'
    if (p.includes('trash') || p.includes('deleted')) return '\\Trash'
    if (p.includes('junk') || p.includes('spam')) return '\\Junk'
    if (p.includes('archive')) return '\\Archive'
    return null
  }

  async getFolders() {
    await this._syncFolders()
    const folders = getFolders()
    // Update unread counts for known folders
    for (const f of folders) {
      try {
        await this._syncFolderCounts(f.path)
      } catch { /* non-selectable folder */ }
    }
    return getFolders()
  }

  async _syncFolderCounts(folder) {
    if (!this.client) return
    const lock = await this.client.getMailboxLock(folder)
    try {
      const status = await this.client.status(folder, { messages: true, unseen: true })
      updateFolderCounts(folder, status.unseen || 0, status.messages || 0)
      if (folder === 'INBOX') {
        this.emit('unread-count', status.unseen || 0)
      }
    } catch (err) {
      logWarn('Could not refresh folder status', { folder, error: err.message })
    } finally {
      lock.release()
    }
  }

  // ── Message fetching ──────────────────────────────────────────────────────

  _syncFolder(folder, background = false) {
    if (!this.client) return Promise.resolve()
    if (this._syncInFlight.has(folder)) return this._syncInFlight.get(folder)
    const p = this._doSyncFolder(folder, background)
    this._syncInFlight.set(folder, p)
    p.then(
      () => this._syncInFlight.delete(folder),
      () => this._syncInFlight.delete(folder)
    )
    return p
  }

  async _doSyncFolder(folder, background = false) {
    if (!this.client) return
    const syncStartedAt = Date.now()
    logSync('Folder sync started', { folder })
    const lock = await this.client.getMailboxLock(folder)
    try {
      const status = await this.client.status(folder, { messages: true, unseen: true })
      const total  = status.messages || 0
      const unseen = status.unseen  || 0
      updateFolderCounts(folder, unseen, total)
      logSync('Folder status fetched', { folder, total, unread: unseen })

      // Always fetch the full UID set from server — this is the source of truth
      const serverUids   = total > 0 ? await this.client.search({ all: true }, { uid: true }) : []
      const serverUidSet = new Set(serverUids)
      const localUids    = getLocalUids(folder, this.email)
      const localUidSet  = new Set(localUids)
      const pendingUids = getPendingLocalUids(folder, this.email)

      // 1. Remove messages deleted from server (UID reconciliation)
      const orphans = getServerOrphanUids(localUids, serverUids, pendingUids)
      if (orphans.length) {
        removeMessages(orphans, folder)
        logDelete('Removed local messages missing on server', { folder, removed: orphans.length })
      }

      // 2. Fetch envelopes for messages not yet cached locally
      const newUids  = serverUids.filter(uid => !localUidSet.has(uid))
      // On cold start limit to most recent 200; afterwards fetch all new
      const toFetch  = localUids.length === 0 ? newUids.slice(-200) : newUids
      let   newCount = 0
      let   maxUid   = serverUids.length > 0 ? serverUids[serverUids.length - 1] : 0

      if (toFetch.length) {
        logMail('Fetching new message envelopes', { folder, count: toFetch.length })
        for await (const msg of this.client.fetch(toFetch, {
          envelope: true, flags: true, bodyStructure: true, size: true
        }, { uid: true })) {
          this._persistEnvelope(msg, folder)
          newCount++
        }
        logMail('Fetched new message envelopes', { folder, count: newCount })
      } else {
        logSync('No new messages', { folder })
      }

      // 3. Sync flags for existing messages — catches read/starred changes from other devices
      //    Limit to most recent 200 to stay fast on large folders
      const existingUids  = localUids.filter(uid => serverUidSet.has(uid))
      const flagSyncBatch = existingUids.slice(-200)
      if (flagSyncBatch.length) {
        let flagUpdates = 0
        for await (const msg of this.client.fetch(flagSyncBatch, { flags: true }, { uid: true })) {
          updateMessageFlags(folder, msg.uid, [...(msg.flags || [])])
          flagUpdates++
        }
        logSync('Message flags refreshed', { folder, count: flagUpdates })
      }

      if (maxUid > 0) upsertSyncState(this.email, folder, maxUid, total)
      this._lastSyncTime.set(folder, Date.now())
      logSync('Folder sync completed', {
        folder,
        newMessages: newCount,
        removed: orphans.length,
        total,
        unread: unseen,
        durationMs: Date.now() - syncStartedAt
      })
      this.emit('sync-complete', { folder, newCount, removedCount: orphans.length })
    } finally {
      lock.release()
    }
  }

  _persistEnvelope(msg, folder) {
    const envelope   = msg.envelope
    const inReplyTo  = envelope.inReplyTo  || null
    const references = envelope.references || null
    const messageId  = envelope.messageId  || null
    const threadId   = computeThreadId(messageId, inReplyTo, references)

    const message = {
      uid:           msg.uid,
      folder,
      account_email: this.email,
      message_id:    messageId,
      subject:       envelope.subject || '(No subject)',
      from_name:     envelope.from?.[0]?.name || envelope.from?.[0]?.address || '',
      from_email:    envelope.from?.[0]?.address || '',
      to_addresses:  parseAddressList(envelope.to),
      cc_addresses:  parseAddressList(envelope.cc),
      date:          envelope.date ? new Date(envelope.date).getTime() : Date.now(),
      flags:         [...(msg.flags || [])],
      snippet:       '',
      has_attachments: this._hasAttachments(msg.bodyStructure),
      size:          msg.size || 0,
      thread_id:     threadId,
      in_reply_to:   inReplyTo,
      message_refs:  references
    }
    upsertMessage(message)

    this._persistAttachmentMeta(msg, folder, messageId)
    this.emit('message-persisted', message)
  }

  _persistAttachmentMeta(msg, folder, messageId) {
    if (!msg.bodyStructure) return
    this._walkBodyStructure(msg.bodyStructure, folder, msg.uid, messageId, '')
  }

  _walkBodyStructure(node, folder, uid, messageId, partId) {
    if (!node) return
    const isAttachment = node.disposition === 'attachment' ||
      (node.disposition === 'inline' && node.type !== 'text')
    if (isAttachment && node.type !== 'multipart') {
      upsertAttachmentMeta({
        uid,
        folder,
        message_id:   messageId,
        part_id:      partId || '1',
        filename:     node.dispositionParameters?.filename || node.parameters?.name || 'attachment',
        content_type: `${node.type}/${node.subtype}`.toLowerCase(),
        size:         node.size || 0,
        content_id:   node.id || null,
        is_inline:    node.disposition === 'inline' ? 1 : 0
      })
    }
    if (node.childNodes) {
      node.childNodes.forEach((child, i) => {
        this._walkBodyStructure(child, folder, uid, messageId, partId ? `${partId}.${i + 1}` : `${i + 1}`)
      })
    }
  }

  async fetchBody(folder, uid) {
    // Return cached body if already fetched
    const cached = getMessageBody(folder, uid)
    const hasCalendarAttachment = getAttachmentsMeta(uid, folder)
      .some(attachment => attachment.content_type === 'text/calendar')
    if (cached?.body_fetched && !hasCalendarAttachment) {
      return {
        html: cached.body_html || null,
        text: cached.body_text || null,
        attachments: [],
        calendarInvites: []
      }
    }

    if (!this.client) throw new Error('Not connected')

    const lock = await this.client.getMailboxLock(folder)
    let parsed = null
    try {
      for await (const msg of this.client.fetch(
        { uid },
        { source: true },
        { uid: true }
      )) {
        if (msg.source) {
          // simpleParser handles quoted-printable, base64, charset decoding automatically
          parsed = await simpleParser(msg.source)
        }
      }
    } finally {
      lock.release()
    }

    if (!parsed) return { html: null, text: null, attachments: [] }

    const html    = parsed.html || null
    const text    = parsed.text || null
    const snippet = extractSnippet(text, html)

    saveMessageBody(folder, uid, html, text)
    if (snippet) updateMessageSnippet(folder, uid, snippet)

    const attachments = (parsed.attachments || []).map(a => ({
      filename: a.filename || 'attachment',
      size:     a.size || 0,
      type:     a.contentType || 'application/octet-stream',
      partId:   a.partId || null
    }))

    const calendarInvites = (parsed.attachments || [])
      .filter(attachment => attachment.contentType === 'text/calendar')
      .map(attachment => ({
        filename: attachment.filename || 'invite.ics',
        ics: attachment.content?.toString('utf8') || '',
        event: parseICalEvents(attachment.content?.toString('utf8') || '')[0] || null
      }))

    return { html, text, attachments, calendarInvites }
  }

  async saveDraft(draft) {
    if (!this.client) throw new Error('Not connected')
    const folders = getFolders()
    const draftFolder = folders.find(folder => folder.special_use === '\\Drafts')?.path || 'Drafts'
    const raw = await buildRawEmail(this.email, {
      fromName: this.email,
      to: draft.to_field || undefined,
      cc: draft.cc_field || undefined,
      bcc: draft.bcc_field || undefined,
      subject: draft.subject || '',
      html: draft.body_html || '',
      text: String(draft.body_html || '').replace(/<[^>]+>/g, ' '),
      inReplyTo: draft.in_reply_to || undefined,
      references: draft.message_refs || undefined,
      attachments: draft.attachments || []
    })

    const result = await this.client.append(draftFolder, raw, ['\\Draft'])
    const newUid = result?.uid || null
    if (!newUid) throw new Error('Draft append did not return a UID')

    if (draft.remote_uid && draft.remote_folder) {
      await this.deleteRemoteDraft(draft.remote_folder, draft.remote_uid)
    }
    return { folder: draftFolder, uid: newUid }
  }

  async deleteRemoteDraft(folder, uid) {
    if (!this.client || !folder || !uid) return
    const lock = await this.client.getMailboxLock(folder)
    try {
      await this.client.messageFlagsAdd([uid], ['\\Deleted'], { uid: true })
      await this.client.messageDelete([uid], { uid: true })
    } finally {
      lock.release()
    }
  }

  async syncDrafts() {
    if (!this.client) return
    const folder = getFolders().find(item => item.special_use === '\\Drafts')?.path
    if (!folder) return
    const lock = await this.client.getMailboxLock(folder)
    try {
      const uids = await this.client.search({ all: true }, { uid: true })
      const recent = (uids || []).slice(-100)
      if (!recent.length) {
        reconcileRemoteDrafts(folder, [])
        return
      }
      for await (const message of this.client.fetch(recent, { source: true }, { uid: true })) {
        if (!message.source) continue
        const parsed = await simpleParser(message.source)
        upsertRemoteDraft({
          account_email: this.email,
          subject: parsed.subject || '',
          to_field: parsed.to?.text || '',
          cc_field: parsed.cc?.text || '',
          bcc_field: parsed.bcc?.text || '',
          body_html: parsed.html || parsed.textAsHtml || parsed.text || '',
          in_reply_to: parsed.inReplyTo || null,
          message_refs: Array.isArray(parsed.references) ? parsed.references.join(' ') : parsed.references || null,
          attachments: [],
          remote_uid: message.uid,
          remote_folder: folder
        })
      }
      reconcileRemoteDrafts(folder, uids)
    } finally {
      lock.release()
    }
  }

  async downloadAttachment(folder, uid, partId, destPath) {
    if (!this.client) throw new Error('Not connected')
    const { createWriteStream } = await import('fs')
    const lock = await this.client.getMailboxLock(folder)
    try {
      const stream = await this.client.download(`${uid}`, partId, { uid: true })
      if (!stream?.content) throw new Error('No content stream returned')
      await new Promise((resolve, reject) => {
        const ws = createWriteStream(destPath)
        stream.content.on('error', reject)
        ws.on('error', reject)
        ws.on('finish', resolve)
        stream.content.pipe(ws)
      })
      return { downloaded: true, filePath: destPath }
    } finally {
      lock.release()
    }
  }

  _hasAttachments(structure) {
    if (!structure) return false
    if (structure.disposition === 'attachment') return true
    if (structure.childNodes) {
      return structure.childNodes.some(c => this._hasAttachments(c))
    }
    return false
  }

  // ── Flags ─────────────────────────────────────────────────────────────────

  async setFlag(folder, uid, flag, add) {
    if (!this.client) throw new Error('Not connected')
    const lock = await this.client.getMailboxLock(folder)
    try {
      if (add) {
        await this.client.messageFlagsAdd([uid], [flag], { uid: true })
      } else {
        await this.client.messageFlagsRemove([uid], [flag], { uid: true })
      }
      toggleMessageFlag(folder, uid, flag, add)
    } finally {
      lock.release()
    }
  }

  // ── Move / Delete ─────────────────────────────────────────────────────────

  async moveMessage(folder, uid, destination) {
    if (!this.client) throw new Error('Not connected')
    logMove('Moving message', { uid, folder, destination })
    const lock = await this.client.getMailboxLock(folder)
    try {
      return await this.client.messageMove([uid], destination, { uid: true })
    } finally {
      lock.release()
    }
  }

  async deleteMessage(folder, uid, permanent = false) {
    if (!this.client) throw new Error('Not connected')

    const folders = getFolders()
    const trashFolder = folders.find(f => f.special_use === '\\Trash')?.path || 'Deleted Messages'

    if (permanent || folder === trashFolder) {
      logDelete('Permanently deleting message', { uid, folder })
      const lock = await this.client.getMailboxLock(folder)
      try {
        await this.client.messageFlagsAdd([uid], ['\\Deleted'], { uid: true })
        return await this.client.messageDelete([uid], { uid: true })
      } finally {
        lock.release()
      }
    } else {
      logDelete('Moving message to trash', { uid, folder, destination: trashFolder })
      return await this.moveMessage(folder, uid, trashFolder)
    }
  }

  async markJunk(folder, uid, isJunk) {
    const folders = getFolders()
    if (isJunk) {
      const junkFolder = folders.find(f => f.special_use === '\\Junk')?.path || 'Junk'
      logMove('Moving message to junk', { uid, folder, destination: junkFolder })
      return await this.moveMessage(folder, uid, junkFolder)
    } else {
      logMove('Removing message from junk', { uid, folder, destination: 'INBOX' })
      return await this.moveMessage(folder, uid, 'INBOX')
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async search(folder, query) {
    if (!this.client) throw new Error('Not connected')
    const lock = await this.client.getMailboxLock(folder)
    const results = []
    try {
      // IMAP server-side search
      const uids = await this.client.search({
        or: [
          { subject: query },
          { from: query },
          { body: query }
        ]
      }, { uid: true })

      if (uids?.length) {
        const range = uids.slice(0, 50)
        for await (const msg of this.client.fetch(range, {
          envelope: true,
          flags: true,
          size: true
        }, { uid: true })) {
          const envelope = msg.envelope
          results.push({
            uid: msg.uid,
            folder,
            subject: envelope.subject || '(No subject)',
            from_name: envelope.from?.[0]?.name || '',
            from_email: envelope.from?.[0]?.address || '',
            date: envelope.date ? new Date(envelope.date).getTime() : 0,
            flags: [...(msg.flags || [])],
            snippet: ''
          })
        }
      }
    } finally {
      lock.release()
    }
    return results
  }

  // ── Bulk operations ───────────────────────────────────────────────────────

  async markAllRead(folder) {
    if (!this.client) throw new Error('Not connected')
    const lock = await this.client.getMailboxLock(folder)
    try {
      const uids = await this.client.search({ seen: false }, { uid: true })
      if (uids?.length) {
        logMail('Marking all messages as read', { folder, count: uids.length })
        await this.client.messageFlagsAdd(uids, ['\\Seen'], { uid: true })
        for (const uid of uids) toggleMessageFlag(folder, uid, '\\Seen', true)
      } else {
        logMail('No unread messages found', { folder })
      }
    } finally {
      lock.release()
    }
  }

  async emptyFolder(folder) {
    if (!this.client) throw new Error('Not connected')
    const lock = await this.client.getMailboxLock(folder)
    try {
      const uids = await this.client.search({ all: true }, { uid: true })
      if (uids?.length) {
        logDelete('Emptying folder', { folder, count: uids.length })
        await this.client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true })
        await this.client.messageDelete(uids, { uid: true })
        removeMessages(uids, folder)
        logDelete('Folder emptied', { folder })
      }
    } finally {
      lock.release()
    }
  }

  async bulkSetFlag(folder, uids, flag, add) {
    if (!this.client) throw new Error('Not connected')
    logMail('Updating message flag', { folder, flag, add, count: uids.length })
    const lock = await this.client.getMailboxLock(folder)
    try {
      if (add) {
        await this.client.messageFlagsAdd(uids, [flag], { uid: true })
      } else {
        await this.client.messageFlagsRemove(uids, [flag], { uid: true })
      }
      for (const uid of uids) toggleMessageFlag(folder, uid, flag, add)
    } finally {
      lock.release()
    }
  }

  async bulkDelete(folder, uids) {
    if (!this.client) throw new Error('Not connected')
    const folders = getFolders()
    const trashFolder = folders.find(f => f.special_use === '\\Trash')?.path || 'Deleted Messages'
    logDelete('Deleting messages', { folder, count: uids.length })
    const lock = await this.client.getMailboxLock(folder)
    try {
      if (folder === trashFolder) {
        await this.client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true })
        return await this.client.messageDelete(uids, { uid: true })
      } else {
        const result = await this.client.messageMove(uids, trashFolder, { uid: true })
        logMove('Moved messages to trash', { folder, destination: trashFolder, count: uids.length })
        return result
      }
    } finally {
      lock.release()
    }
  }

  async bulkMove(folder, uids, destination) {
    if (!this.client) throw new Error('Not connected')
    logMove('Moving messages', { folder, destination, count: uids.length })
    const lock = await this.client.getMailboxLock(folder)
    try {
      return await this.client.messageMove(uids, destination, { uid: true })
    } finally {
      lock.release()
    }
  }

  // ── Manual sync ───────────────────────────────────────────────────────────

  async syncInbox() {
    await this._syncFolder('INBOX', false)
    await this._syncFolderCounts('INBOX')
  }
}
