import {
  getDB,
  persistDBImmediate,
  recalcFolderUnread,
  removeOptimisticMoveCopies,
  restoreAttachmentSnapshots,
  restoreMessageSnapshots,
  setMessagesSyncStatus,
  updateMessageFlags
} from './store/db.js'
import { logSync, logErr } from './logger.js'
import { BrowserWindow } from 'electron'

// Sync queue operations for offline-first architecture
// Maintains a persistent ordered queue of pending IMAP/SMTP operations

function getMainWindow() {
  return BrowserWindow.getAllWindows().find(win => !win.isDestroyed())
}

export function emitSyncOperationUpdate(update) {
  const mainWindow = getMainWindow()
  if (mainWindow) mainWindow.webContents.send('sync:operation-update', update)
}

export function enqueueSyncOperation(operation, targetType, data, options = {}) {
  const d = getDB()
  const {
    accountEmail,
    folder,
    uid,
    targetId,
    availableAt,
    coalesce = false
  } = options

  let replacedCount = 0
  if (coalesce && targetId) {
    const existing = d.prepare(
      `SELECT COUNT(*) AS count FROM sync_queue WHERE operation = ? AND target_type = ? AND target_id = ?`
    )
    existing.bind([operation, targetType, String(targetId)])
    if (existing.step()) replacedCount = Number(existing.getAsObject().count || 0)
    existing.free()
    d.run(
      `DELETE FROM sync_queue WHERE operation = ? AND target_type = ? AND target_id = ?`,
      [operation, targetType, String(targetId)]
    )
  }
  d.run(`
    INSERT INTO sync_queue
      (operation, target_type, target_id, data, account_email, folder, uid, next_retry_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    operation,
    targetType,
    targetId || null,
    JSON.stringify(data),
    accountEmail || null,
    folder || null,
    uid || null,
    availableAt || null
  ])
  persistDBImmediate()

  logSync('Sync operation queued', {
    op: operation,
    target: targetType,
    folder,
    uid,
    account: accountEmail
  })
  emitSyncOperationUpdate({
    operation,
    targetType,
    folder: folder || null,
    uid: uid || null,
    account: accountEmail || null,
    status: 'queued',
    retryCount: 0
  })

  // Notify renderer that a sync operation started
  const mainWindow = getMainWindow()
  if (mainWindow && replacedCount === 0) {
    mainWindow.webContents.send('sync:operation-start')
  }
}

export function dequeuePendingOperations() {
  const d = getDB()
  const now = Date.now()
  const stmt = d.prepare(`
    SELECT * FROM sync_queue
    WHERE next_retry_at IS NULL OR next_retry_at <= ?
    ORDER BY created_at ASC
    LIMIT 50
  `)
  stmt.bind([now])
  const operations = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    operations.push({
      ...row,
      data: JSON.parse(row.data)
    })
  }
  stmt.free()
  return operations
}

export function markSyncOperationCompleted(id) {
  const d = getDB()
  d.run(`DELETE FROM sync_queue WHERE id = ?`, [id])
  persistDBImmediate()
  emitSyncOperationUpdate({ id, status: 'completed' })

  // Notify renderer that a sync operation completed
  const mainWindow = getMainWindow()
  if (mainWindow) {
    mainWindow.webContents.send('sync:operation-end')
  }
}

export function markSyncOperationFailed(id, error) {
  const d = getDB()

  const stmt = d.prepare(`SELECT retry_count, operation, folder, uid FROM sync_queue WHERE id = ?`)
  stmt.bind([id])
  let op = null
  if (stmt.step()) op = stmt.getAsObject()
  stmt.free()
  if (!op) return false

  const newRetryCount = (op.retry_count || 0) + 1

  if (newRetryCount >= 5) {
    const mainWindow = getMainWindow()
    emitSyncOperationUpdate({
      id,
      operation: op.operation,
      uid: op.uid,
      folder: op.folder,
      status: 'failed',
      retryCount: newRetryCount,
      error
    })
    if (mainWindow) {
      mainWindow.webContents.send('sync:operation-failed', {
        operation: op.operation,
        uid: op.uid,
        folder: op.folder,
        error
      })
      mainWindow.webContents.send('sync:operation-end')
    }
    d.run(`DELETE FROM sync_queue WHERE id = ?`, [id])
    persistDBImmediate()
    logErr('Sync operation dead-lettered', {
      op: op.operation,
      folder: op.folder,
      uid: op.uid,
      retry: newRetryCount,
      error
    })
    return true
  }

  const nextRetryAt = Date.now() + Math.min(Math.pow(2, newRetryCount) * 2000, 60000)
  d.run(`
    UPDATE sync_queue
    SET retry_count = ?, last_error = ?, next_retry_at = ?
    WHERE id = ?
  `, [newRetryCount, error, nextRetryAt, id])
  persistDBImmediate()
  emitSyncOperationUpdate({
    id,
    operation: op.operation,
    uid: op.uid,
    folder: op.folder,
    status: 'retrying',
    retryCount: newRetryCount,
    error,
    nextRetryAt
  })
  logErr('Sync operation scheduled for retry', {
    op: op.operation,
    folder: op.folder,
    uid: op.uid,
    retry: newRetryCount,
    nextInSec: Math.round((nextRetryAt - Date.now()) / 1000),
    error
  })
  return false
}

export function clearFailedOperations() {
  const d = getDB()
  d.run(`DELETE FROM sync_queue WHERE retry_count >= 5`)
  persistDBImmediate()
}

// Outbox operations for optimistic email sending
export function addToOutbox(emailData) {
  const d = getDB()
  d.run(`
    INSERT INTO outbox
    (account_email, to_field, cc_field, bcc_field, subject, body_html, body_text,
     attachments, in_reply_to, message_refs, send_after)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    emailData.accountEmail,
    emailData.to,
    emailData.cc || null,
    emailData.bcc || null,
    emailData.subject,
    emailData.html || null,
    emailData.text || null,
    JSON.stringify(emailData.attachments || []),
    emailData.inReplyTo || null,
    emailData.references || null,
    emailData.sendAfter || null
  ])

  const result = d.exec(`SELECT last_insert_rowid() as id`)
  const id = result[0]?.values?.[0]?.[0]
  logSync(`[Outbox] Added email to outbox: ${id}`)
  persistDBImmediate()

  return id
}

export function getPendingOutboxEmails(accountEmail) {
  const d = getDB()
  const stmt = d.prepare(`
    SELECT * FROM outbox
    WHERE account_email = ? AND sync_status = 'pending'
    ORDER BY created_at ASC
  `)
  stmt.bind([accountEmail])
  const emails = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    emails.push({
      ...row,
      attachments: JSON.parse(row.attachments || '[]')
    })
  }
  stmt.free()
  return emails
}

export function markOutboxEmailSent(id) {
  const d = getDB()
  d.run(`
    UPDATE outbox
    SET sync_status = 'sent', sent_at = strftime('%s','now') * 1000
    WHERE id = ?
  `, [id])
  persistDBImmediate()
}

export function markOutboxEmailFailed(id, error) {
  const d = getDB()
  d.run(`
    UPDATE outbox
    SET sync_status = 'error', error_message = ?
    WHERE id = ?
  `, [error, id])
  persistDBImmediate()
}

// Optimistic local operations
export function updateMessageOptimistic(folder, uid, updates, options = {}) {
  const d = getDB()
  const setClauses = []
  const values = []

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`)
    if (key === 'flags') {
      values.push(JSON.stringify(value))
    } else {
      values.push(value)
    }
  }

  // Always mark as pending sync when making optimistic updates
  setClauses.push('sync_status = ?')
  values.push('pending')

  values.push(folder, uid)

  d.run(`
    UPDATE messages
    SET ${setClauses.join(', ')}
    WHERE folder = ? AND uid = ?
  `, values)

  if (options.immediate) {
    persistDBImmediate()
  }
}

export function markOptimisticOperationSynced(operation) {
  const { operation: type, data, folder, uid } = operation
  if (type === 'setFlags' && uid) {
    setMessagesSyncStatus(folder, [uid], 'synced')
  } else if (type === 'bulkSetFlags') {
    setMessagesSyncStatus(folder, data.uids || [], 'synced')
  } else {
    return
  }
  persistDBImmediate()
}

export function cancelOutboxEmail(id) {
  const d = getDB()
  const stmt = d.prepare(`SELECT sync_status FROM outbox WHERE id = ?`)
  stmt.bind([id])
  const row = stmt.step() ? stmt.getAsObject() : null
  stmt.free()
  if (!row || row.sync_status !== 'pending') return false
  d.run(`DELETE FROM sync_queue WHERE operation = 'sendEmail' AND target_id = ?`, [String(id)])
  d.run(`UPDATE outbox SET sync_status = 'cancelled' WHERE id = ?`, [id])
  persistDBImmediate()
  emitSyncOperationUpdate({ operation: 'sendEmail', targetId: id, status: 'cancelled' })
  const mainWindow = getMainWindow()
  mainWindow?.webContents.send('sync:operation-end')
  return true
}

export function rollbackQueuedOperation(operation, error) {
  const { operation: type, data, folder, uid } = operation

  if (type === 'setFlags' && uid && Array.isArray(data.originalFlags)) {
    updateMessageFlags(folder, uid, data.originalFlags)
    setMessagesSyncStatus(folder, [uid], 'synced')
    recalcFolderUnread(folder)
  } else if (type === 'bulkSetFlags' && Array.isArray(data.originalFlags)) {
    for (const original of data.originalFlags) {
      updateMessageFlags(folder, original.uid, original.flags || [])
    }
    setMessagesSyncStatus(folder, data.originalFlags.map(original => original.uid), 'synced')
    recalcFolderUnread(folder)
  } else if (['moveMessage', 'deleteMessage', 'markJunk', 'bulkDelete', 'bulkMove'].includes(type)) {
    removeOptimisticMoveCopies(data.optimisticMessages || [])
    restoreMessageSnapshots(data.originalMessages || [])
    restoreAttachmentSnapshots(data.originalAttachments || [])
  } else {
    return
  }

  persistDBImmediate()
  const update = {
    operation: type,
    folder: folder || null,
    uid: uid || null,
    uids: data.uids || null,
    destination: data.destination || null,
    flags: type === 'setFlags' ? data.originalFlags : null,
    status: 'rolled-back',
    error
  }
  emitSyncOperationUpdate(update)
  const mainWindow = getMainWindow()
  mainWindow?.webContents.send('sync:rollback', update)
  logErr('Optimistic operation rolled back', update)
}
