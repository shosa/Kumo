import initSqlJs from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { logErr, logWarn } from '../logger.js'
import { buildOptimisticMovePlan, normalizeUidMap } from '../optimisticMove.js'
import {
  clearReclaimableCache as clearReclaimableCacheTables,
  rebuildMailCache as rebuildMailCacheTables
} from '../cacheMaintenance.js'

let db = null
let SQL = null
let dbPath = null
let saveTimer = null

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persistDB, 500)
}

function persistDB() {
  if (!db || !dbPath) return
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
}

export function persistDBImmediate() {
  if (!db || !dbPath) return
  clearTimeout(saveTimer)
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
}

export async function initDB() {
  if (db) return db

  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'db')
  mkdirSync(dbDir, { recursive: true })
  dbPath = join(dbDir, 'mail.db')

  // Locate the WASM file (shipped as extraResource)
  const wasmPath = existsSync(join(process.resourcesPath || '', 'sql-wasm.wasm'))
    ? join(process.resourcesPath, 'sql-wasm.wasm')
    : join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')

  SQL = await initSqlJs({
    locateFile: () => wasmPath
  })

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`PRAGMA foreign_keys = ON`)

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      uid          INTEGER NOT NULL,
      folder       TEXT    NOT NULL,
      message_id   TEXT,
      subject      TEXT,
      from_name    TEXT,
      from_email   TEXT,
      to_addresses TEXT,
      cc_addresses TEXT,
      date         INTEGER,
      flags        TEXT    DEFAULT '[]',
      snippet      TEXT,
      has_attachments INTEGER DEFAULT 0,
      size         INTEGER DEFAULT 0,
      body_html    TEXT,
      body_text    TEXT,
      body_fetched INTEGER DEFAULT 0,
      UNIQUE(uid, folder)
    )
  `)

  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_folder_date ON messages(folder, date DESC)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_uid_folder ON messages(uid, folder)`)

  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      path         TEXT    UNIQUE NOT NULL,
      name         TEXT,
      delimiter    TEXT,
      unread_count INTEGER DEFAULT 0,
      total_count  INTEGER DEFAULT 0,
      special_use  TEXT,
      flags        TEXT    DEFAULT '[]'
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sender_logo_cache (
      domain      TEXT PRIMARY KEY,
      result_json TEXT NOT NULL,
      expires_at  INTEGER NOT NULL
    )
  `)

  // Default settings
  const defaults = {
    syncMode: 'idle',
    syncInterval: 5,
    blockRemoteImages: true,
    notificationsEnabled: true,
    notifyFolders: ['INBOX'],
    signature: '',
    theme: 'light',
    language: 'en-US',
    showSenderLogos: false
  }
  for (const [key, value] of Object.entries(defaults)) {
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, JSON.stringify(value)])
  }

  try {
    _runMigrations(db)
  } catch (err) {
    logErr('Database migration failed', { version: 1, fatal: false, error: err.message })
  }

  try {
    _migrate2(db)
  } catch (err) {
    logErr('Database migration failed', { version: 2, fatal: false, error: err.message })
  }

  try {
    _migrate3(db)
  } catch (err) {
    logErr('Database migration failed', { version: 3, fatal: false, error: err.message })
  }

  try {
    _migrate4(db)
  } catch (err) {
    logErr('Database migration failed', { version: 4, fatal: false, error: err.message })
  }

  try {
    _migrate5(db)
  } catch (err) {
    logErr('Database migration failed', { version: 5, fatal: false, error: err.message })
  }

  try {
    _migrate6(db)
  } catch (err) {
    logErr('Database migration failed', { version: 6, fatal: false, error: err.message })
  }

  try {
    _migrate7(db)
  } catch (err) {
    logErr('Database migration failed', { version: 7, fatal: false, error: err.message })
  }

  try {
    _migrate8(db)
  } catch (err) {
    logErr('Database migration failed', { version: 8, fatal: false, error: err.message })
  }

  try {
    _migrate9(db)
    _migrate10(db)
  } catch (err) {
    logErr('Database migration failed', { version: 9, fatal: false, error: err.message })
  }

  persistDB()
  return db
}

function _runMigrations(d) {
  // Read current schema version (default 0 if not yet set)
  let ver = 0
  let stmt
  try {
    stmt = d.prepare(`SELECT value FROM settings WHERE key = 'schemaVersion'`)
    if (stmt.step()) {
      ver = parseInt(JSON.parse(stmt.getAsObject().value), 10) || 0
    }
  } catch { /* settings may not exist yet */ }
  finally { try { stmt?.free() } catch { /* ignore */ } }

  if (ver >= 1) return

  // ── Migration to version 1 ────────────────────────────────────────────────

  // New table: sync_state
  d.run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      account_email TEXT NOT NULL,
      folder        TEXT NOT NULL,
      last_uid      INTEGER DEFAULT 0,
      last_sync_at  INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      PRIMARY KEY (account_email, folder)
    )
  `)

  // New table: accounts
  d.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT    UNIQUE NOT NULL,
      display_name TEXT,
      imap_host    TEXT    DEFAULT 'imap.mail.me.com',
      imap_port    INTEGER DEFAULT 993,
      smtp_host    TEXT    DEFAULT 'smtp.mail.me.com',
      smtp_port    INTEGER DEFAULT 587,
      auth_type    TEXT    DEFAULT 'password',
      is_default   INTEGER DEFAULT 0,
      created_at   INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `)

  // New table: drafts
  d.run(`
    CREATE TABLE IF NOT EXISTS drafts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      account_email TEXT,
      subject       TEXT    DEFAULT '',
      to_field      TEXT    DEFAULT '',
      cc_field      TEXT    DEFAULT '',
      bcc_field     TEXT    DEFAULT '',
      body_html     TEXT    DEFAULT '',
      in_reply_to   TEXT,
      message_refs  TEXT,
      attachments   TEXT    DEFAULT '[]',
      created_at    INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at    INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `)

  // New table: attachments
  d.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      uid          INTEGER NOT NULL,
      folder       TEXT    NOT NULL,
      message_id   TEXT,
      part_id      TEXT,
      filename     TEXT,
      content_type TEXT    DEFAULT 'application/octet-stream',
      size         INTEGER DEFAULT 0,
      content_id   TEXT,
      is_inline    INTEGER DEFAULT 0,
      file_path    TEXT,
      downloaded   INTEGER DEFAULT 0
    )
  `)
  d.run(`CREATE INDEX IF NOT EXISTS idx_att_uid_folder ON attachments(uid, folder)`)

  // Add new columns to existing messages table (only if not already present)
  const existingCols = new Set()
  let colStmt
  try {
    colStmt = d.prepare(`PRAGMA table_info(messages)`)
    while (colStmt.step()) {
      const col = colStmt.getAsObject()
      if (col?.name) existingCols.add(col.name)
    }
  } finally {
    try { colStmt?.free() } catch { /* ignore */ }
  }

  if (!existingCols.has('account_email')) {
    d.run(`ALTER TABLE messages ADD COLUMN account_email TEXT`)
  }
  if (!existingCols.has('thread_id')) {
    d.run(`ALTER TABLE messages ADD COLUMN thread_id TEXT`)
  }
  if (!existingCols.has('in_reply_to')) {
    d.run(`ALTER TABLE messages ADD COLUMN in_reply_to TEXT`)
  }
  if (!existingCols.has('message_refs')) {
    d.run(`ALTER TABLE messages ADD COLUMN message_refs TEXT`)
  }

  d.run(`CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)`)

  // FTS5 — best-effort; WASM may not have FTS5 compiled in
  try {
    d.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        uid       UNINDEXED,
        folder    UNINDEXED,
        subject,
        body_text,
        from_name,
        from_email
      )
    `)

    // Only back-fill if not already done (prevents duplicates on retry)
    const ftsSeeded = (() => {
      try {
        const s = d.prepare(`SELECT value FROM settings WHERE key = 'fts_seeded'`)
        const has = s.step() && s.getAsObject().value === '"1"'
        s.free()
        return has
      } catch { return false }
    })()

    if (!ftsSeeded) {
      d.run(`
        INSERT INTO messages_fts(uid, folder, subject, body_text, from_name, from_email)
        SELECT uid, folder,
               COALESCE(subject,''),
               COALESCE(body_text,''),
               COALESCE(from_name,''),
               COALESCE(from_email,'')
        FROM messages
      `)
      d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('fts_seeded', '1')`)
    }
  } catch (err) {
    logWarn('FTS5 unavailable', { error: err.message })
  }

  // Mark migration as complete
  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', '1')`)
}

function _migrate2(d) {
  let ver = 0
  try {
    const s = d.prepare(`SELECT value FROM settings WHERE key = 'schemaVersion'`)
    if (s.step()) ver = parseInt(JSON.parse(s.getAsObject().value), 10) || 0
    s.free()
  } catch { /* ignore */ }
  if (ver >= 2) return

  d.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id            TEXT PRIMARY KEY,
      account_email TEXT,
      display_name  TEXT,
      first_name    TEXT,
      last_name     TEXT,
      email         TEXT,
      emails        TEXT DEFAULT '[]',
      phone         TEXT,
      phones        TEXT DEFAULT '[]',
      organization  TEXT,
      title         TEXT,
      notes         TEXT,
      etag          TEXT,
      href          TEXT,
      vcard         TEXT,
      source        TEXT DEFAULT 'carddav',
      updated_at    INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `)
  d.run(`CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)`)
  d.run(`CREATE INDEX IF NOT EXISTS idx_contacts_name  ON contacts(display_name)`)
  d.run(`CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_email)`)

  d.run(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id            TEXT PRIMARY KEY,
      account_email TEXT,
      calendar_id   TEXT,
      title         TEXT,
      description   TEXT,
      location      TEXT,
      start_ts      INTEGER,
      end_ts        INTEGER,
      all_day       INTEGER DEFAULT 0,
      rrule         TEXT,
      status        TEXT DEFAULT 'CONFIRMED',
      organizer     TEXT,
      attendees     TEXT DEFAULT '[]',
      etag          TEXT,
      href          TEXT,
      updated_at    INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `)
  d.run(`CREATE INDEX IF NOT EXISTS idx_events_start   ON calendar_events(start_ts)`)
  d.run(`CREATE INDEX IF NOT EXISTS idx_events_account ON calendar_events(account_email)`)

  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', '2')`)
}

function _migrate3(d) {
  let ver = 0
  try {
    const s = d.prepare(`SELECT value FROM settings WHERE key = 'schemaVersion'`)
    if (s.step()) ver = parseInt(JSON.parse(s.getAsObject().value), 10) || 0
    s.free()
  } catch { /* ignore */ }
  if (ver >= 3) return

  try { d.run(`ALTER TABLE contacts ADD COLUMN birthday TEXT`) } catch { /* already exists */ }
  try { d.run(`ALTER TABLE contacts ADD COLUMN photo_url TEXT`) } catch { /* already exists */ }
  try { d.run(`ALTER TABLE contacts ADD COLUMN social_profiles TEXT DEFAULT '[]'`) } catch { /* already exists */ }

  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', '3')`)
}

function _migrate4(d) {
  let ver = 0
  try {
    const s = d.prepare(`SELECT value FROM settings WHERE key = 'schemaVersion'`)
    if (s.step()) ver = parseInt(JSON.parse(s.getAsObject().value), 10) || 0
    s.free()
  } catch { /* ignore */ }
  if (ver >= 4) return

  // Add sync_status column to tables for offline-first sync
  try { d.run(`ALTER TABLE messages ADD COLUMN sync_status TEXT DEFAULT 'synced'`) } catch { /* already exists */ }
  try { d.run(`ALTER TABLE contacts ADD COLUMN sync_status TEXT DEFAULT 'synced'`) } catch { /* already exists */ }
  try { d.run(`ALTER TABLE calendar_events ADD COLUMN sync_status TEXT DEFAULT 'synced'`) } catch { /* already exists */ }
  try { d.run(`ALTER TABLE drafts ADD COLUMN sync_status TEXT DEFAULT 'pending'`) } catch { /* already exists */ }

  // Create sync queue table for persistent operation queue
  d.run(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      operation    TEXT NOT NULL,
      target_type  TEXT NOT NULL,
      target_id    TEXT,
      data         TEXT NOT NULL,
      account_email TEXT,
      folder       TEXT,
      uid          INTEGER,
      created_at   INTEGER DEFAULT (strftime('%s','now') * 1000),
      retry_count  INTEGER DEFAULT 0,
      last_error   TEXT
    )
  `)

  // Create outbox table for sending emails optimistically
  d.run(`
    CREATE TABLE IF NOT EXISTS outbox (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      account_email TEXT NOT NULL,
      to_field      TEXT NOT NULL,
      cc_field      TEXT,
      bcc_field     TEXT,
      subject       TEXT NOT NULL,
      body_html     TEXT,
      body_text     TEXT,
      attachments   TEXT DEFAULT '[]',
      in_reply_to   TEXT,
      message_refs  TEXT,
      sync_status   TEXT DEFAULT 'pending',
      created_at    INTEGER DEFAULT (strftime('%s','now') * 1000),
      sent_at       INTEGER,
      error_message TEXT
    )
  `)

  d.run(`CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at ASC)`)
  d.run(`CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(sync_status)`)

  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', '4')`)
}

function _migrate5(d) {
  let ver = 0
  try {
    const s = d.prepare(`SELECT value FROM settings WHERE key = 'schemaVersion'`)
    if (s.step()) ver = parseInt(JSON.parse(s.getAsObject().value), 10) || 0
    s.free()
  } catch { /* ignore */ }
  if (ver >= 5) return

  try { d.run(`ALTER TABLE sync_queue ADD COLUMN next_retry_at INTEGER`) } catch { /* already exists */ }
  d.run(`CREATE INDEX IF NOT EXISTS idx_sync_queue_retry ON sync_queue(next_retry_at ASC)`)
  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', '5')`)
}

function _migrate8(d) {
  let ver = 0
  try {
    const s = d.prepare(`SELECT value FROM settings WHERE key = 'schemaVersion'`)
    if (s.step()) ver = parseInt(JSON.parse(s.getAsObject().value), 10) || 0
    s.free()
  } catch { /* ignore */ }
  if (ver >= 8) return

  try { d.run(`ALTER TABLE calendar_events ADD COLUMN calendar_href TEXT`) } catch { /* already exists */ }
  d.run(`CREATE INDEX IF NOT EXISTS idx_events_href ON calendar_events(calendar_href)`)
  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', '8')`)
}

function _migrate7(d) {
  let ver = 0
  try {
    const s = d.prepare(`SELECT value FROM settings WHERE key = 'schemaVersion'`)
    if (s.step()) ver = parseInt(JSON.parse(s.getAsObject().value), 10) || 0
    s.free()
  } catch { /* ignore */ }
  if (ver >= 7) return

  d.run(`
    CREATE TABLE IF NOT EXISTS calendar_sources (
      href            TEXT PRIMARY KEY,
      account_email   TEXT,
      name            TEXT NOT NULL,
      color           TEXT DEFAULT '#0071e3',
      supports_events INTEGER DEFAULT 1,
      supports_todos  INTEGER DEFAULT 0,
      enabled         INTEGER DEFAULT 1,
      updated_at      INTEGER
    )
  `)
  d.run(`CREATE INDEX IF NOT EXISTS idx_cal_sources_account ON calendar_sources(account_email)`)
  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', '7')`)
}

function _migrate6(d) {
  let ver = 0
  try {
    const s = d.prepare(`SELECT value FROM settings WHERE key = 'schemaVersion'`)
    if (s.step()) ver = parseInt(JSON.parse(s.getAsObject().value), 10) || 0
    s.free()
  } catch { /* ignore */ }
  if (ver >= 6) return

  try { d.run(`ALTER TABLE calendar_events ADD COLUMN type TEXT DEFAULT 'event'`) } catch { /* already exists */ }
  d.run(`CREATE INDEX IF NOT EXISTS idx_events_type ON calendar_events(type)`)
  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', '6')`)
}

function _migrate9(d) {
  let ver = 0
  try {
    const s = d.prepare(`SELECT value FROM settings WHERE key = 'schemaVersion'`)
    if (s.step()) ver = parseInt(JSON.parse(s.getAsObject().value), 10) || 0
    s.free()
  } catch { /* ignore */ }
  if (ver >= 9) return

  try { d.run(`ALTER TABLE drafts ADD COLUMN remote_uid INTEGER`) } catch { /* already exists */ }
  try { d.run(`ALTER TABLE drafts ADD COLUMN remote_folder TEXT`) } catch { /* already exists */ }
  try { d.run(`ALTER TABLE outbox ADD COLUMN send_after INTEGER`) } catch { /* already exists */ }

  d.run(`
    CREATE TABLE IF NOT EXISTS mail_rules (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      enabled       INTEGER DEFAULT 1,
      match_json    TEXT NOT NULL DEFAULT '{}',
      action_json   TEXT NOT NULL DEFAULT '{}',
      stop_after    INTEGER DEFAULT 1,
      created_at    INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at    INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `)
  d.run(`CREATE INDEX IF NOT EXISTS idx_mail_rules_enabled ON mail_rules(enabled, id)`)
  d.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('undoSendDelay', '10')`)
  d.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('conversationView', 'true')`)
  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', '9')`)
}

function _migrate10(d) {
  let ver = 0
  try {
    const s = d.prepare(`SELECT value FROM settings WHERE key = 'schemaVersion'`)
    if (s.step()) ver = parseInt(JSON.parse(s.getAsObject().value), 10) || 0
    s.free()
  } catch { /* ignore */ }
  if (ver >= 10) return

  try { d.run(`ALTER TABLE calendar_sources ADD COLUMN writable INTEGER DEFAULT 1`) } catch { /* already exists */ }
  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', '10')`)
}

export function getDB() {
  if (!db) throw new Error('DB not initialized — call initDB() first')
  return db
}

function allRows(stmt) {
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function oneRow(stmt) {
  let row = null
  if (stmt.step()) row = stmt.getAsObject()
  stmt.free()
  return row
}

export function upsertMessage(msg) {
  const d = getDB()
  d.run(`
    INSERT INTO messages
      (uid, folder, account_email, message_id, subject, from_name, from_email,
       to_addresses, cc_addresses, date, flags, snippet, has_attachments, size,
       thread_id, in_reply_to, message_refs)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(uid, folder) DO UPDATE SET
      flags           = excluded.flags,
      snippet         = COALESCE(NULLIF(excluded.snippet,''), messages.snippet),
      has_attachments = excluded.has_attachments,
      thread_id       = COALESCE(excluded.thread_id, messages.thread_id),
      in_reply_to     = COALESCE(excluded.in_reply_to, messages.in_reply_to),
      message_refs    = COALESCE(excluded.message_refs, messages.message_refs),
      account_email   = COALESCE(excluded.account_email, messages.account_email)
  `, [
    msg.uid, msg.folder,
    msg.account_email || null,
    msg.message_id || '',
    msg.subject || '', msg.from_name || '', msg.from_email || '',
    JSON.stringify(msg.to_addresses || []),
    JSON.stringify(msg.cc_addresses || []),
    msg.date || Date.now(),
    JSON.stringify(msg.flags || []),
    msg.snippet || '',
    msg.has_attachments ? 1 : 0,
    msg.size || 0,
    msg.thread_id || null,
    msg.in_reply_to || null,
    msg.message_refs || null
  ])
  try {
    // INSERT OR IGNORE so we don't overwrite body_text from a previous fetchBody
    d.run(`
      INSERT OR IGNORE INTO messages_fts(uid, folder, subject, body_text, from_name, from_email)
      VALUES (?, ?, ?, '', ?, ?)
    `, [msg.uid, msg.folder, msg.subject || '', msg.from_name || '', msg.from_email || ''])
    // Then update the header fields (but not body_text) in case subject/sender changed
    d.run(`
      UPDATE messages_fts SET subject = ?, from_name = ?, from_email = ?
      WHERE uid = ? AND folder = ?
    `, [msg.subject || '', msg.from_name || '', msg.from_email || '', msg.uid, msg.folder])
  } catch { /* FTS5 best-effort */ }
  scheduleSave()
}

export function saveMessageBody(folder, uid, html, text) {
  const d = getDB()
  d.run(
    `UPDATE messages SET body_html = ?, body_text = ?, body_fetched = 1 WHERE folder = ? AND uid = ?`,
    [html, text, folder, uid]
  )
  try {
    d.run(
      `UPDATE messages_fts SET body_text = ? WHERE uid = ? AND folder = ?`,
      [text || '', uid, folder]
    )
  } catch { /* FTS5 best-effort */ }
  scheduleSave()
}

export function getMessageBody(folder, uid) {
  const d = getDB()
  const stmt = d.prepare(
    `SELECT body_html, body_text, body_fetched FROM messages WHERE folder = ? AND uid = ?`
  )
  stmt.bind([folder, uid])
  return oneRow(stmt)
}

export function getMessages(folder, limit, offset) {
  const d = getDB()
  const stmt = d.prepare(`
    SELECT uid, folder, message_id, subject, from_name, from_email,
           to_addresses, cc_addresses, date, flags, snippet, has_attachments, size,
           thread_id, in_reply_to, message_refs, sync_status
    FROM messages
    WHERE folder = ?
    ORDER BY date DESC
    LIMIT ? OFFSET ?
  `)
  stmt.bind([folder, limit, offset])
  const rows = allRows(stmt)
  return rows.map(r => ({
    ...r,
    flags: JSON.parse(r.flags || '[]'),
    to_addresses: JSON.parse(r.to_addresses || '[]'),
    cc_addresses: JSON.parse(r.cc_addresses || '[]'),
    has_attachments: r.has_attachments === 1
  }))
}

function hydrateMessageRow(row) {
  return {
    ...row,
    flags: JSON.parse(row.flags || '[]'),
    to_addresses: JSON.parse(row.to_addresses || '[]'),
    cc_addresses: JSON.parse(row.cc_addresses || '[]'),
    has_attachments: row.has_attachments === 1
  }
}

export function getThreadMessages(threadId, messageId = null) {
  const d = getDB()
  const stmt = d.prepare(`
    SELECT uid, folder, message_id, subject, from_name, from_email,
           to_addresses, cc_addresses, date, flags, snippet, has_attachments, size,
           body_html, body_text, body_fetched, thread_id, in_reply_to, message_refs,
           sync_status
    FROM messages
    WHERE thread_id = ?
       OR message_id = ?
       OR in_reply_to = ?
       OR message_refs LIKE ?
    ORDER BY date ASC
  `)
  const identity = threadId || messageId || ''
  stmt.bind([identity, identity, identity, `%${identity}%`])
  return allRows(stmt).map(hydrateMessageRow)
}

function buildSmartWhere(definition = {}) {
  const clauses = []
  const params = []
  if (definition.unread === true) clauses.push(`flags NOT LIKE '%\\\\Seen%'`)
  if (definition.starred === true) clauses.push(`flags LIKE '%\\\\Flagged%'`)
  if (definition.hasAttachments === true) clauses.push(`has_attachments = 1`)
  if (definition.from) {
    clauses.push(`LOWER(from_email) LIKE ?`)
    params.push(`%${String(definition.from).toLowerCase()}%`)
  }
  if (definition.subject) {
    clauses.push(`LOWER(subject) LIKE ?`)
    params.push(`%${String(definition.subject).toLowerCase()}%`)
  }
  if (definition.text) {
    clauses.push(`(LOWER(subject) LIKE ? OR LOWER(snippet) LIKE ?)`)
    const value = `%${String(definition.text).toLowerCase()}%`
    params.push(value, value)
  }
  if (definition.folder) {
    clauses.push(`folder = ?`)
    params.push(definition.folder)
  }
  if (definition.needsReply === true) {
    clauses.push(`flags NOT LIKE '%\\\\Seen%'`)
    clauses.push(`folder NOT IN (
      SELECT path FROM folders
      WHERE special_use IN ('\\\\Sent', '\\\\Drafts', '\\\\Trash', '\\\\Junk')
    )`)
    clauses.push(`date >= ?`)
    params.push(Date.now() - 14 * 86400000)
  }
  return { where: clauses.length ? clauses.join(' AND ') : '1=1', params }
}

export function getSmartMessages(definition, limit, offset) {
  const d = getDB()
  const { where, params } = buildSmartWhere(definition)
  const stmt = d.prepare(`
    SELECT uid, folder, message_id, subject, from_name, from_email,
           to_addresses, cc_addresses, date, flags, snippet, has_attachments, size,
           thread_id, in_reply_to, message_refs, sync_status
    FROM messages
    WHERE ${where}
    ORDER BY date DESC
    LIMIT ? OFFSET ?
  `)
  stmt.bind([...params, limit, offset])
  return allRows(stmt).map(hydrateMessageRow)
}

export function getSmartMessageCount(definition) {
  const d = getDB()
  const { where, params } = buildSmartWhere(definition)
  const stmt = d.prepare(`SELECT COUNT(*) AS count FROM messages WHERE ${where}`)
  stmt.bind(params)
  return oneRow(stmt)?.count || 0
}

export function getMessageCount(folder) {
  const d = getDB()
  const stmt = d.prepare(`SELECT COUNT(*) as count FROM messages WHERE folder = ?`)
  stmt.bind([folder])
  const row = oneRow(stmt)
  return row?.count || 0
}

export function upsertFolder(folder) {
  const d = getDB()
  d.run(`
    INSERT INTO folders (path, name, delimiter, special_use, flags, unread_count, total_count)
    VALUES (?,?,?,?,?,0,0)
    ON CONFLICT(path) DO UPDATE SET
      name         = excluded.name,
      special_use  = COALESCE(excluded.special_use, folders.special_use)
  `, [
    folder.path, folder.name, folder.delimiter,
    folder.special_use || null,
    JSON.stringify(folder.flags || [])
  ])
  scheduleSave()
}

export function updateFolderCounts(path, unread, total) {
  const d = getDB()
  d.run(`UPDATE folders SET unread_count = ?, total_count = ? WHERE path = ?`, [unread, total, path])
  scheduleSave()
}

export function getFolders() {
  const d = getDB()
  const stmt = d.prepare(`SELECT * FROM folders ORDER BY special_use DESC, path ASC`)
  const rows = allRows(stmt)
  return rows.map(f => ({
    ...f,
    flags: JSON.parse(f.flags || '[]')
  }))
}

export function searchMessages(query) {
  if (!query?.trim()) return []
  const d = getDB()
  try {
    const ftsQuery = query.trim().split(/\s+/)
      .filter(Boolean)
      .map(w => `"${w.replace(/"/g, '')}"`)
      .join(' ')
    const stmt = d.prepare(`
      SELECT m.uid, m.folder, m.subject, m.from_name, m.from_email,
             m.date, m.flags, m.snippet, m.has_attachments, m.thread_id
      FROM messages_fts f
      JOIN messages m ON m.uid = CAST(f.uid AS INTEGER) AND m.folder = f.folder
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT 100
    `)
    stmt.bind([ftsQuery])
    const rows = allRows(stmt)
    return rows.map(r => ({ ...r, flags: JSON.parse(r.flags || '[]') }))
  } catch {
    const like = `%${query}%`
    const stmt = d.prepare(`
      SELECT uid, folder, subject, from_name, from_email, date, flags, snippet, has_attachments, thread_id
      FROM messages
      WHERE subject LIKE ? OR from_name LIKE ? OR from_email LIKE ? OR snippet LIKE ?
      ORDER BY date DESC
      LIMIT 100
    `)
    stmt.bind([like, like, like, like])
    const rows = allRows(stmt)
    return rows.map(r => ({ ...r, flags: JSON.parse(r.flags || '[]') }))
  }
}

export function getSettings() {
  const d = getDB()
  const stmt = d.prepare(`SELECT key, value FROM settings`)
  const rows = allRows(stmt)
  return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]))
}

export function saveSetting(key, value) {
  const d = getDB()
  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, JSON.stringify(value)])
  scheduleSave()
}

export function getSenderLogoCache(domain) {
  const d = getDB()
  const stmt = d.prepare(`
    SELECT result_json, expires_at
    FROM sender_logo_cache
    WHERE domain = ?
  `)
  stmt.bind([domain])
  const row = oneRow(stmt)
  if (!row) return null
  try {
    return {
      result: JSON.parse(row.result_json),
      expiresAt: Number(row.expires_at)
    }
  } catch {
    d.run(`DELETE FROM sender_logo_cache WHERE domain = ?`, [domain])
    scheduleSave()
    return null
  }
}

export function setSenderLogoCache(domain, entry) {
  const d = getDB()
  d.run(`
    INSERT OR REPLACE INTO sender_logo_cache (domain, result_json, expires_at)
    VALUES (?, ?, ?)
  `, [domain, JSON.stringify(entry.result), entry.expiresAt])
  scheduleSave()
}

export function clearSenderLogoCache() {
  const d = getDB()
  d.run(`DELETE FROM sender_logo_cache`)
  scheduleSave()
}

export function getLocalUids(folder, accountEmail) {
  const d = getDB()
  const stmt = accountEmail
    ? d.prepare(`SELECT uid FROM messages WHERE folder = ? AND account_email = ?`)
    : d.prepare(`SELECT uid FROM messages WHERE folder = ?`)
  accountEmail ? stmt.bind([folder, accountEmail]) : stmt.bind([folder])
  const uids = []
  while (stmt.step()) uids.push(stmt.getAsObject().uid)
  stmt.free()
  return uids
}

export function getPendingLocalUids(folder, accountEmail) {
  const d = getDB()
  const stmt = accountEmail
    ? d.prepare(`SELECT uid FROM messages WHERE folder = ? AND account_email = ? AND sync_status = 'pending'`)
    : d.prepare(`SELECT uid FROM messages WHERE folder = ? AND sync_status = 'pending'`)
  accountEmail ? stmt.bind([folder, accountEmail]) : stmt.bind([folder])
  const uids = []
  while (stmt.step()) uids.push(stmt.getAsObject().uid)
  stmt.free()
  return uids
}

export function updateMessageFlags(folder, uid, flags) {
  const d = getDB()
  d.run(`UPDATE messages SET flags = ? WHERE folder = ? AND uid = ?`,
    [JSON.stringify(flags), folder, uid])
  scheduleSave()
}

export function toggleMessageFlag(folder, uid, flag, add) {
  const d = getDB()
  const stmt = d.prepare(`SELECT flags FROM messages WHERE folder = ? AND uid = ?`)
  stmt.bind([folder, uid])
  let flags = []
  if (stmt.step()) {
    try { flags = JSON.parse(stmt.getAsObject().flags || '[]') } catch {}
  }
  stmt.free()
  const updated = add
    ? [...new Set([...flags, flag])]
    : flags.filter(f => f !== flag)
  d.run(`UPDATE messages SET flags = ? WHERE folder = ? AND uid = ?`,
    [JSON.stringify(updated), folder, uid])
  scheduleSave()
}

export function getMessageSnapshots(folder, uids) {
  if (!uids?.length) return []
  const d = getDB()
  const placeholders = uids.map(() => '?').join(',')
  const stmt = d.prepare(`
    SELECT *
    FROM messages
    WHERE folder = ? AND uid IN (${placeholders})
  `)
  stmt.bind([folder, ...uids])
  return allRows(stmt)
}

export function getAttachmentSnapshots(folder, uids) {
  if (!uids?.length) return []
  const d = getDB()
  const placeholders = uids.map(() => '?').join(',')
  const stmt = d.prepare(`
    SELECT *
    FROM attachments
    WHERE folder = ? AND uid IN (${placeholders})
  `)
  stmt.bind([folder, ...uids])
  return allRows(stmt)
}

export function setMessagesSyncStatus(folder, uids, status) {
  if (!uids?.length) return
  const d = getDB()
  const placeholders = uids.map(() => '?').join(',')
  d.run(
    `UPDATE messages SET sync_status = ? WHERE folder = ? AND uid IN (${placeholders})`,
    [status, folder, ...uids]
  )
  scheduleSave()
}

export function restoreMessageSnapshots(messages) {
  if (!messages?.length) return
  const d = getDB()

  for (const message of messages) {
    d.run(`
      INSERT OR REPLACE INTO messages
        (id, uid, folder, message_id, subject, from_name, from_email,
         to_addresses, cc_addresses, date, flags, snippet, has_attachments, size,
         body_html, body_text, body_fetched, account_email, thread_id, in_reply_to,
         message_refs, sync_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      message.id,
      message.uid,
      message.folder,
      message.message_id,
      message.subject,
      message.from_name,
      message.from_email,
      message.to_addresses,
      message.cc_addresses,
      message.date,
      message.flags,
      message.snippet,
      message.has_attachments,
      message.size,
      message.body_html,
      message.body_text,
      message.body_fetched,
      message.account_email,
      message.thread_id,
      message.in_reply_to,
      message.message_refs,
      'synced'
    ])

    try {
      d.run(`DELETE FROM messages_fts WHERE uid = ? AND folder = ?`, [message.uid, message.folder])
      d.run(`
        INSERT INTO messages_fts(uid, folder, subject, body_text, from_name, from_email)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        message.uid,
        message.folder,
        message.subject || '',
        message.body_text || message.snippet || '',
        message.from_name || '',
        message.from_email || ''
      ])
    } catch { /* FTS5 best-effort */ }
  }

  const folders = [...new Set(messages.map(message => message.folder).filter(Boolean))]
  for (const folder of folders) recalcFolderUnread(folder)
  scheduleSave()
}

export function restoreAttachmentSnapshots(attachments) {
  if (!attachments?.length) return
  const d = getDB()

  for (const attachment of attachments) {
    d.run(`
      INSERT OR REPLACE INTO attachments
        (id, uid, folder, message_id, part_id, filename, content_type, size,
         content_id, is_inline, file_path, downloaded)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      attachment.id,
      attachment.uid,
      attachment.folder,
      attachment.message_id,
      attachment.part_id,
      attachment.filename,
      attachment.content_type,
      attachment.size,
      attachment.content_id,
      attachment.is_inline,
      attachment.file_path,
      attachment.downloaded
    ])
  }
  scheduleSave()
}

function getNextProvisionalUid() {
  const d = getDB()
  const stmt = d.prepare(`SELECT MIN(uid) AS min_uid FROM messages WHERE uid < 0`)
  const row = oneRow(stmt)
  return Math.min(-1, (row?.min_uid || 0) - 1)
}

function insertMessageSnapshot(message) {
  const d = getDB()
  d.run(`
    INSERT OR REPLACE INTO messages
      (uid, folder, message_id, subject, from_name, from_email,
       to_addresses, cc_addresses, date, flags, snippet, has_attachments, size,
       body_html, body_text, body_fetched, account_email, thread_id, in_reply_to,
       message_refs, sync_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    message.uid,
    message.folder,
    message.message_id,
    message.subject,
    message.from_name,
    message.from_email,
    message.to_addresses,
    message.cc_addresses,
    message.date,
    message.flags,
    message.snippet,
    message.has_attachments,
    message.size,
    message.body_html,
    message.body_text,
    message.body_fetched,
    message.account_email,
    message.thread_id,
    message.in_reply_to,
    message.message_refs,
    message.sync_status || 'pending'
  ])

  try {
    d.run(`
      INSERT INTO messages_fts(uid, folder, subject, body_text, from_name, from_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      message.uid,
      message.folder,
      message.subject || '',
      message.body_text || message.snippet || '',
      message.from_name || '',
      message.from_email || ''
    ])
  } catch { /* FTS5 best-effort */ }
}

function copyAttachments(sourceFolder, sourceUid, destination, provisionalUid) {
  const d = getDB()
  d.run(`
    INSERT INTO attachments
      (uid, folder, message_id, part_id, filename, content_type, size,
       content_id, is_inline, file_path, downloaded)
    SELECT ?, ?, message_id, part_id, filename, content_type, size,
           content_id, is_inline, file_path, downloaded
    FROM attachments
    WHERE folder = ? AND uid = ?
  `, [provisionalUid, destination, sourceFolder, sourceUid])
}

export function moveMessagesOptimistic(sourceFolder, uids, destination) {
  if (!uids?.length || !destination || sourceFolder === destination) {
    return { originalMessages: [], originalAttachments: [], optimisticMessages: [] }
  }

  const d = getDB()
  const originalMessages = getMessageSnapshots(sourceFolder, uids)
  const originalAttachments = getAttachmentSnapshots(sourceFolder, uids)
  const plan = buildOptimisticMovePlan(
    originalMessages,
    destination,
    getNextProvisionalUid()
  )

  d.run('BEGIN')
  try {
    for (const { optimisticMessage, mapping } of plan) {
      insertMessageSnapshot(optimisticMessage)
      copyAttachments(sourceFolder, mapping.sourceUid, destination, mapping.provisionalUid)
    }
    removeMessages(uids, sourceFolder)
    recalcFolderUnread(destination)
    d.run('COMMIT')
  } catch (error) {
    d.run('ROLLBACK')
    throw error
  }

  persistDBImmediate()
  return {
    originalMessages,
    originalAttachments,
    optimisticMessages: plan.map(item => item.mapping)
  }
}

export function reconcileOptimisticMove(optimisticMessages, uidMap) {
  if (!optimisticMessages?.length) return
  const d = getDB()
  const normalizedUidMap = normalizeUidMap(uidMap)

  d.run('BEGIN')
  try {
    for (const mapping of optimisticMessages) {
      const destinationUid = normalizedUidMap.get(Number(mapping.sourceUid))
      if (!destinationUid) continue

      d.run(
        `DELETE FROM messages WHERE folder = ? AND uid = ? AND uid != ?`,
        [mapping.destination, destinationUid, mapping.provisionalUid]
      )
      d.run(
        `DELETE FROM attachments WHERE folder = ? AND uid = ? AND uid != ?`,
        [mapping.destination, destinationUid, mapping.provisionalUid]
      )
      try {
        d.run(
          `DELETE FROM messages_fts WHERE folder = ? AND uid = ? AND uid != ?`,
          [mapping.destination, destinationUid, mapping.provisionalUid]
        )
      } catch { /* FTS5 best-effort */ }
      d.run(
        `UPDATE messages SET uid = ?, sync_status = 'synced' WHERE folder = ? AND uid = ?`,
        [destinationUid, mapping.destination, mapping.provisionalUid]
      )
      d.run(
        `UPDATE attachments SET uid = ? WHERE folder = ? AND uid = ?`,
        [destinationUid, mapping.destination, mapping.provisionalUid]
      )
      try {
        d.run(
          `UPDATE messages_fts SET uid = ? WHERE folder = ? AND uid = ?`,
          [destinationUid, mapping.destination, mapping.provisionalUid]
        )
      } catch { /* FTS5 best-effort */ }
    }
    d.run('COMMIT')
  } catch (error) {
    d.run('ROLLBACK')
    throw error
  }

  persistDBImmediate()
}

export function removeOptimisticMoveCopies(optimisticMessages) {
  if (!optimisticMessages?.length) return
  const d = getDB()
  const destinations = new Set()

  for (const mapping of optimisticMessages) {
    d.run(
      `DELETE FROM messages WHERE folder = ? AND uid = ?`,
      [mapping.destination, mapping.provisionalUid]
    )
    d.run(
      `DELETE FROM attachments WHERE folder = ? AND uid = ?`,
      [mapping.destination, mapping.provisionalUid]
    )
    try {
      d.run(
        `DELETE FROM messages_fts WHERE folder = ? AND uid = ?`,
        [mapping.destination, mapping.provisionalUid]
      )
    } catch { /* FTS5 best-effort */ }
    destinations.add(mapping.destination)
  }

  for (const destination of destinations) recalcFolderUnread(destination)
  scheduleSave()
}

export function getSyncQueueCount() {
  const d = getDB()
  const stmt = d.prepare(`SELECT COUNT(*) as cnt FROM sync_queue`)
  let count = 0
  if (stmt.step()) count = stmt.getAsObject().cnt || 0
  stmt.free()
  return count
}

export function recalcFolderUnread(folder) {
  const d = getDB()
  const stmt = d.prepare(
    `SELECT COUNT(*) as cnt FROM messages WHERE folder = ? AND (flags IS NULL OR flags NOT LIKE '%\\\\Seen%')`
  )
  stmt.bind([folder])
  let unread = 0
  if (stmt.step()) unread = stmt.getAsObject().cnt || 0
  stmt.free()
  d.run(`UPDATE folders SET unread_count = ? WHERE path = ?`, [unread, folder])
  scheduleSave()
}

export function removeMessages(uids, folder) {
  if (!uids?.length) return
  const d = getDB()
  const placeholders = uids.map(() => '?').join(',')
  d.run(`DELETE FROM messages WHERE folder = ? AND uid IN (${placeholders})`, [folder, ...uids])
  d.run(`DELETE FROM attachments WHERE folder = ? AND uid IN (${placeholders})`, [folder, ...uids])
  try {
    d.run(`DELETE FROM messages_fts WHERE folder = ? AND uid IN (${placeholders})`, [folder, ...uids])
  } catch { /* FTS5 best-effort */ }
  recalcFolderUnread(folder)
  scheduleSave()
}

export function clearMessages() {
  const d = getDB()
  rebuildMailCacheTables(d)
  persistDBImmediate()
}

export function clearBodyCache() {
  const d = getDB()
  d.run(`UPDATE messages SET body_html = NULL, body_text = NULL, body_fetched = 0`)
  try { d.run(`UPDATE messages_fts SET body_text = ''`) } catch { /* FTS5 best-effort */ }
  persistDBImmediate()
}

export function clearFolderCache() {
  const d = getDB()
  d.run(`DELETE FROM folders`)
  scheduleSave()
}

export function getDbPath() {
  return dbPath
}

export function clearReclaimableCache() {
  clearReclaimableCacheTables(getDB())
  persistDBImmediate()
}

export function rebuildMailCache() {
  rebuildMailCacheTables(getDB())
  persistDBImmediate()
}

export function getStorageCounts() {
  const d = getDB()
  const value = (sql) => Number(d.exec(sql)[0]?.values?.[0]?.[0] || 0)
  return {
    messages: value(`SELECT COUNT(*) FROM messages`),
    cachedBodies: value(`SELECT COUNT(*) FROM messages WHERE body_fetched = 1`),
    downloadedAttachments: value(`SELECT COUNT(*) FROM attachments WHERE downloaded = 1`),
    senderLogos: value(`SELECT COUNT(*) FROM sender_logo_cache`),
    contacts: value(`SELECT COUNT(*) FROM contacts`),
    calendarEvents: value(`SELECT COUNT(*) FROM calendar_events`)
  }
}

export function resetAllData() {
  const d = getDB()
  d.run(`DELETE FROM messages`)
  d.run(`DELETE FROM folders`)
  d.run(`DELETE FROM settings`)
  d.run(`DELETE FROM accounts`)
  d.run(`DELETE FROM sync_state`)
  d.run(`DELETE FROM drafts`)
  d.run(`DELETE FROM attachments`)
  d.run(`DELETE FROM contacts`)
  d.run(`DELETE FROM calendar_events`)
  d.run(`DELETE FROM calendar_sources`)
  d.run(`DELETE FROM sync_queue`)
  d.run(`DELETE FROM outbox`)
  d.run(`DELETE FROM sender_logo_cache`)
  try { d.run(`DELETE FROM messages_fts`) } catch { /* FTS5 best-effort */ }
  persistDBImmediate()
}

// Graceful shutdown — ensure pending writes are flushed
export function closeDB() {
  clearTimeout(saveTimer)
  persistDB()
  db?.close()
  db = null
}

// ── sync_state helpers ────────────────────────────────────────────────────────

export function getSyncState(accountEmail, folder) {
  const d = getDB()
  const stmt = d.prepare(
    `SELECT last_uid, last_sync_at, message_count FROM sync_state WHERE account_email = ? AND folder = ?`
  )
  stmt.bind([accountEmail, folder])
  return oneRow(stmt)
}

export function upsertSyncState(accountEmail, folder, lastUid, messageCount) {
  const d = getDB()
  d.run(`
    INSERT INTO sync_state (account_email, folder, last_uid, last_sync_at, message_count)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_email, folder) DO UPDATE SET
      last_uid      = excluded.last_uid,
      last_sync_at  = excluded.last_sync_at,
      message_count = excluded.message_count
  `, [accountEmail, folder, lastUid, Date.now(), messageCount])
  scheduleSave()
}

// ── draft helpers ─────────────────────────────────────────────────────────────

export function upsertDraft(draft) {
  const d = getDB()
  if (draft.id) {
    d.run(`
      UPDATE drafts SET
        account_email = ?, subject = ?, to_field = ?, cc_field = ?, bcc_field = ?,
        body_html = ?, in_reply_to = ?, message_refs = ?, attachments = ?,
        remote_uid = COALESCE(?, remote_uid), remote_folder = COALESCE(?, remote_folder),
        sync_status = ?,
        updated_at = strftime('%s','now') * 1000
      WHERE id = ?
    `, [
      draft.account_email || null, draft.subject || '', draft.to_field || '',
      draft.cc_field || '', draft.bcc_field || '', draft.body_html || '',
      draft.in_reply_to || null, draft.message_refs || null,
      JSON.stringify(draft.attachments || []),
      draft.remote_uid || null, draft.remote_folder || null,
      draft.sync_status || 'pending',
      draft.id
    ])
    scheduleSave()
    return draft.id
  }
  d.run(`
    INSERT INTO drafts
      (account_email, subject, to_field, cc_field, bcc_field, body_html,
       in_reply_to, message_refs, attachments, remote_uid, remote_folder, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    draft.account_email || null, draft.subject || '', draft.to_field || '',
    draft.cc_field || '', draft.bcc_field || '', draft.body_html || '',
    draft.in_reply_to || null, draft.message_refs || null,
    JSON.stringify(draft.attachments || []),
    draft.remote_uid || null, draft.remote_folder || null,
    draft.sync_status || 'pending'
  ])
  scheduleSave()
  const rows = d.exec(`SELECT last_insert_rowid() as id`)
  return rows[0]?.values?.[0]?.[0] || null
}

export function getDrafts(accountEmail) {
  const d = getDB()
  if (!accountEmail) {
    return allRows(d.prepare(`SELECT * FROM drafts ORDER BY updated_at DESC`))
      .map(r => ({ ...r, attachments: JSON.parse(r.attachments || '[]') }))
  }
  const stmt = d.prepare(
    `SELECT * FROM drafts WHERE account_email = ? OR account_email IS NULL ORDER BY updated_at DESC`
  )
  stmt.bind([accountEmail])
  const rows = allRows(stmt)
  return rows.map(r => ({ ...r, attachments: JSON.parse(r.attachments || '[]') }))
}

export function deleteDraft(id) {
  const d = getDB()
  d.run(`DELETE FROM drafts WHERE id = ?`, [id])
  scheduleSave()
}

export function getDraft(id) {
  const d = getDB()
  const stmt = d.prepare(`SELECT * FROM drafts WHERE id = ?`)
  stmt.bind([id])
  const row = oneRow(stmt)
  return row ? { ...row, attachments: JSON.parse(row.attachments || '[]') } : null
}

export function findDraftByRemote(folder, uid) {
  const d = getDB()
  const stmt = d.prepare(`SELECT * FROM drafts WHERE remote_folder = ? AND remote_uid = ?`)
  stmt.bind([folder, uid])
  const row = oneRow(stmt)
  return row ? { ...row, attachments: JSON.parse(row.attachments || '[]') } : null
}

export function markDraftSynced(id, remoteFolder, remoteUid) {
  const d = getDB()
  d.run(`
    UPDATE drafts
    SET remote_folder = ?, remote_uid = ?, sync_status = 'synced',
        updated_at = strftime('%s','now') * 1000
    WHERE id = ?
  `, [remoteFolder, remoteUid, id])
  persistDBImmediate()
}

export function upsertRemoteDraft(draft) {
  const existing = findDraftByRemote(draft.remote_folder, draft.remote_uid)
  return upsertDraft({
    ...draft,
    id: existing?.id,
    sync_status: 'synced'
  })
}

export function reconcileRemoteDrafts(folder, remoteUids) {
  const d = getDB()
  const uids = [...new Set((remoteUids || []).map(Number).filter(Number.isFinite))]
  if (uids.length === 0) {
    d.run(`DELETE FROM drafts WHERE remote_folder = ? AND sync_status = 'synced'`, [folder])
  } else {
    const placeholders = uids.map(() => '?').join(',')
    d.run(`
      DELETE FROM drafts
      WHERE remote_folder = ? AND sync_status = 'synced'
        AND remote_uid NOT IN (${placeholders})
    `, [folder, ...uids])
  }
  scheduleSave()
}

// ── local mail rules ─────────────────────────────────────────────────────────

function hydrateRule(row) {
  return {
    ...row,
    enabled: row.enabled === 1,
    stop_after: row.stop_after === 1,
    match: JSON.parse(row.match_json || '{}'),
    action: JSON.parse(row.action_json || '{}')
  }
}

export function getMailRules(enabledOnly = false) {
  const d = getDB()
  const stmt = d.prepare(`
    SELECT * FROM mail_rules
    ${enabledOnly ? 'WHERE enabled = 1' : ''}
    ORDER BY id ASC
  `)
  return allRows(stmt).map(hydrateRule)
}

export function saveMailRule(rule) {
  const d = getDB()
  if (rule.id) {
    d.run(`
      UPDATE mail_rules
      SET name = ?, enabled = ?, match_json = ?, action_json = ?, stop_after = ?,
          updated_at = strftime('%s','now') * 1000
      WHERE id = ?
    `, [
      rule.name || 'Rule', rule.enabled === false ? 0 : 1,
      JSON.stringify(rule.match || {}), JSON.stringify(rule.action || {}),
      rule.stop_after === false ? 0 : 1, rule.id
    ])
    scheduleSave()
    return rule.id
  }
  d.run(`
    INSERT INTO mail_rules (name, enabled, match_json, action_json, stop_after)
    VALUES (?, ?, ?, ?, ?)
  `, [
    rule.name || 'Rule', rule.enabled === false ? 0 : 1,
    JSON.stringify(rule.match || {}), JSON.stringify(rule.action || {}),
    rule.stop_after === false ? 0 : 1
  ])
  scheduleSave()
  return d.exec(`SELECT last_insert_rowid()`)[0]?.values?.[0]?.[0] || null
}

export function deleteMailRule(id) {
  const d = getDB()
  d.run(`DELETE FROM mail_rules WHERE id = ?`, [id])
  scheduleSave()
}

export function messageMatchesRule(message, rule) {
  const match = rule?.match || {}
  const from = String(message.from_email || '').toLowerCase()
  const subject = String(message.subject || '').toLowerCase()
  const snippet = String(message.snippet || '').toLowerCase()
  if (match.from && !from.includes(String(match.from).toLowerCase())) return false
  if (match.subject && !subject.includes(String(match.subject).toLowerCase())) return false
  if (match.text) {
    const value = String(match.text).toLowerCase()
    if (!subject.includes(value) && !snippet.includes(value)) return false
  }
  if (match.hasAttachments === true && !message.has_attachments) return false
  return true
}

// ── attachment metadata helpers ───────────────────────────────────────────────

export function upsertAttachmentMeta(att) {
  const d = getDB()
  const partId = att.part_id || null
  d.run(`
    UPDATE attachments SET
      filename = ?, content_type = ?, size = ?, content_id = ?, is_inline = ?
    WHERE uid = ? AND folder = ? AND (part_id = ? OR (part_id IS NULL AND ? IS NULL))
  `, [
    att.filename || 'attachment',
    att.content_type || 'application/octet-stream',
    att.size || 0,
    att.content_id || null,
    att.is_inline ? 1 : 0,
    att.uid, att.folder,
    partId, partId
  ])
  const changed = d.exec(`SELECT changes()`)[0]?.values?.[0]?.[0] || 0
  if (changed === 0) {
    d.run(`
      INSERT INTO attachments
        (uid, folder, message_id, part_id, filename, content_type, size, content_id, is_inline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      att.uid, att.folder, att.message_id || null,
      partId, att.filename || 'attachment',
      att.content_type || 'application/octet-stream', att.size || 0,
      att.content_id || null, att.is_inline ? 1 : 0
    ])
  }
  scheduleSave()
}

export function getAttachmentsMeta(uid, folder) {
  const d = getDB()
  const stmt = d.prepare(`SELECT * FROM attachments WHERE uid = ? AND folder = ?`)
  stmt.bind([uid, folder])
  return allRows(stmt)
}

export function markAttachmentDownloaded(id, filePath) {
  const d = getDB()
  d.run(`UPDATE attachments SET downloaded = 1, file_path = ? WHERE id = ?`, [filePath, id])
  scheduleSave()
}

// ── snippet / FTS helpers ─────────────────────────────────────────────────────

export function updateMessageSnippet(folder, uid, snippet) {
  const d = getDB()
  d.run(
    `UPDATE messages SET snippet = ? WHERE folder = ? AND uid = ? AND (snippet IS NULL OR snippet = '')`,
    [snippet, folder, uid]
  )
  try {
    d.run(
      `UPDATE messages_fts SET body_text = ? WHERE uid = ? AND folder = ? AND body_text = ''`,
      [snippet, uid, folder]
    )
  } catch { /* FTS5 best-effort */ }
  scheduleSave()
}

// ── contacts helpers ──────────────────────────────────────────────────────────

export function upsertContact(contact) {
  const d = getDB()
  d.run(`
    INSERT INTO contacts
      (id, account_email, display_name, first_name, last_name, email, emails,
       phone, phones, organization, title, notes, birthday, photo_url, social_profiles,
       etag, href, vcard, source, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      display_name    = excluded.display_name,
      first_name      = excluded.first_name,
      last_name       = excluded.last_name,
      email           = excluded.email,
      emails          = excluded.emails,
      phone           = excluded.phone,
      phones          = excluded.phones,
      organization    = excluded.organization,
      title           = excluded.title,
      notes           = excluded.notes,
      birthday        = excluded.birthday,
      photo_url       = excluded.photo_url,
      social_profiles = excluded.social_profiles,
      etag            = excluded.etag,
      href            = excluded.href,
      vcard           = excluded.vcard,
      source          = excluded.source,
      updated_at      = excluded.updated_at
  `, [
    contact.id, contact.account_email || null,
    contact.display_name || '', contact.first_name || '', contact.last_name || '',
    contact.email || '', JSON.stringify(contact.emails || []),
    contact.phone || '', JSON.stringify(contact.phones || []),
    contact.organization || null, contact.title || null, contact.notes || null,
    contact.birthday || null, contact.photo_url || null,
    JSON.stringify(contact.social_profiles || []),
    contact.etag || null, contact.href || null, contact.vcard || null,
    contact.source || 'carddav', Date.now()
  ])
  scheduleSave()
}

function _hydrateContact(r) {
  return {
    ...r,
    emails:          JSON.parse(r.emails          || '[]'),
    phones:          JSON.parse(r.phones          || '[]'),
    social_profiles: JSON.parse(r.social_profiles || '[]'),
  }
}

export function getContacts(accountEmail) {
  const d = getDB()
  const stmt = accountEmail
    ? d.prepare(`SELECT * FROM contacts WHERE (account_email = ? OR account_email IS NULL) ORDER BY display_name ASC`)
    : d.prepare(`SELECT * FROM contacts ORDER BY display_name ASC`)
  if (accountEmail) stmt.bind([accountEmail])
  const rows = allRows(stmt)
  return rows.map(r => _hydrateContact(r))
}

export function searchContacts(query, accountEmail) {
  const d = getDB()
  const q = `%${query}%`
  // Only include contacts with valid email addresses
  const emailFilter = `email IS NOT NULL AND email != '' AND email LIKE '%@%.%' AND email NOT LIKE '%@%@%' AND LENGTH(TRIM(email)) = LENGTH(email)`
  const stmt = d.prepare(`
    SELECT * FROM contacts
    WHERE (display_name LIKE ? OR email LIKE ? OR organization LIKE ?)
      AND ${emailFilter}
      ${accountEmail ? 'AND (account_email = ? OR account_email IS NULL)' : ''}
    ORDER BY display_name ASC
    LIMIT 20
  `)
  const params = accountEmail ? [q, q, q, accountEmail] : [q, q, q]
  stmt.bind(params)
  const rows = allRows(stmt)
  return rows.map(r => _hydrateContact(r))
}

export function deleteContacts(accountEmail) {
  const d = getDB()
  d.run(`DELETE FROM contacts WHERE account_email = ? AND source = 'carddav'`, [accountEmail])
  scheduleSave()
}

export function deleteContact(id) {
  const d = getDB()
  d.run(`DELETE FROM contacts WHERE id = ?`, [id])
  scheduleSave()
}

// ── calendar source helpers ───────────────────────────────────────────────────

export function upsertCalendarSource(src) {
  const d = getDB()
  d.run(`
    INSERT INTO calendar_sources
      (href, account_email, name, color, supports_events, supports_todos, writable, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(href) DO UPDATE SET
      name            = excluded.name,
      color           = excluded.color,
      supports_events = excluded.supports_events,
      supports_todos  = excluded.supports_todos,
      writable        = excluded.writable,
      updated_at      = excluded.updated_at
  `, [
    src.href, src.account_email || null, src.name, src.color || '#0071e3',
    src.supportsEvents ? 1 : 0, src.supportsTodos ? 1 : 0,
    src.writable === false ? 0 : 1, Date.now()
  ])
  scheduleSave()
}

export function getCalendarSources(accountEmail) {
  const d = getDB()
  const stmt = accountEmail
    ? d.prepare(`SELECT * FROM calendar_sources WHERE account_email = ? OR account_email IS NULL ORDER BY name ASC`)
    : d.prepare(`SELECT * FROM calendar_sources ORDER BY name ASC`)
  if (accountEmail) stmt.bind([accountEmail])
  return allRows(stmt)
}

export function setCalendarSourceEnabled(href, enabled) {
  const d = getDB()
  d.run(`UPDATE calendar_sources SET enabled = ? WHERE href = ?`, [enabled ? 1 : 0, href])
  scheduleSave()
}

// ── calendar helpers ──────────────────────────────────────────────────────────

export function upsertEvent(event) {
  const d = getDB()
  d.run(`
    INSERT INTO calendar_events
      (id, account_email, calendar_id, calendar_href, title, description, location,
       start_ts, end_ts, all_day, rrule, status, organizer, attendees, etag, href, type, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title          = excluded.title,
      description    = excluded.description,
      location       = excluded.location,
      start_ts       = excluded.start_ts,
      end_ts         = excluded.end_ts,
      all_day        = excluded.all_day,
      rrule          = excluded.rrule,
      status         = excluded.status,
      organizer      = excluded.organizer,
      attendees      = excluded.attendees,
      etag           = excluded.etag,
      href           = excluded.href,
      type           = excluded.type,
      calendar_href  = excluded.calendar_href,
      updated_at     = excluded.updated_at
  `, [
    event.id, event.account_email || null, event.calendar_id || null,
    event.calendar_href || null,
    event.title || '', event.description || null, event.location || null,
    event.start_ts || 0, event.end_ts || 0, event.all_day ? 1 : 0,
    event.rrule || null, event.status || 'CONFIRMED',
    event.organizer
      ? (typeof event.organizer === 'string' ? event.organizer : JSON.stringify(event.organizer))
      : null,
    JSON.stringify(event.attendees || []),
    event.etag || null, event.href || null,
    event.type || 'event', Date.now()
  ])
  scheduleSave()
}

export function getEvents(accountEmail, fromTs, toTs) {
  const d = getDB()
  const from = fromTs || Date.now() - 86400000 * 7
  const to = toTs || Date.now() + 86400000 * 90
  const stmt = accountEmail
    ? d.prepare(`SELECT * FROM calendar_events WHERE (account_email = ? OR account_email IS NULL) AND start_ts >= ? AND start_ts <= ? ORDER BY start_ts ASC`)
    : d.prepare(`SELECT * FROM calendar_events WHERE start_ts >= ? AND start_ts <= ? ORDER BY start_ts ASC`)
  if (accountEmail) stmt.bind([accountEmail, from, to])
  else stmt.bind([from, to])
  const rows = allRows(stmt)
  return rows.map(r => {
    let organizer = r.organizer
    if (organizer?.startsWith('{')) {
      try { organizer = JSON.parse(organizer) } catch { /* keep stored value */ }
    }
    return { ...r, organizer, attendees: JSON.parse(r.attendees || '[]') }
  })
}

export function deleteEvents(accountEmail, calendarId) {
  const d = getDB()
  if (calendarId) {
    d.run(`DELETE FROM calendar_events WHERE account_email = ? AND calendar_id = ?`, [accountEmail, calendarId])
  } else {
    d.run(`DELETE FROM calendar_events WHERE account_email = ?`, [accountEmail])
  }
  scheduleSave()
}

export function deleteEvent(id) {
  const d = getDB()
  d.run(`DELETE FROM calendar_events WHERE id = ?`, [id])
  scheduleSave()
}
