import test from 'node:test'
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import {
  clearReclaimableCache,
  rebuildMailCache
} from './cacheMaintenance.js'

async function createDatabase() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(`CREATE TABLE messages (body_html TEXT, body_text TEXT, body_fetched INTEGER)`)
  db.run(`CREATE TABLE messages_fts (body_text TEXT)`)
  db.run(`CREATE TABLE attachments (downloaded INTEGER, file_path TEXT)`)
  db.run(`CREATE TABLE sender_logo_cache (domain TEXT)`)
  db.run(`CREATE TABLE folders (path TEXT)`)
  db.run(`CREATE TABLE sync_state (folder TEXT)`)
  db.run(`CREATE TABLE sync_queue (id INTEGER)`)
  db.run(`INSERT INTO messages VALUES ('<p>body</p>', 'body', 1)`)
  db.run(`INSERT INTO messages_fts VALUES ('searchable body')`)
  db.run(`INSERT INTO attachments VALUES (1, 'C:/cache/file.pdf')`)
  db.run(`INSERT INTO sender_logo_cache VALUES ('example.com')`)
  db.run(`INSERT INTO folders VALUES ('INBOX')`)
  db.run(`INSERT INTO sync_state VALUES ('INBOX')`)
  return db
}

function scalar(db, sql) {
  return db.exec(sql)[0]?.values?.[0]?.[0] ?? null
}

test('safe cleanup removes downloaded content while preserving message headers', async () => {
  const db = await createDatabase()

  clearReclaimableCache(db)

  assert.equal(scalar(db, `SELECT COUNT(*) FROM messages`), 1)
  assert.equal(scalar(db, `SELECT body_html FROM messages`), null)
  assert.equal(scalar(db, `SELECT body_text FROM messages`), null)
  assert.equal(scalar(db, `SELECT body_fetched FROM messages`), 0)
  assert.equal(scalar(db, `SELECT body_text FROM messages_fts`), '')
  assert.equal(scalar(db, `SELECT downloaded FROM attachments`), 0)
  assert.equal(scalar(db, `SELECT file_path FROM attachments`), null)
  assert.equal(scalar(db, `SELECT COUNT(*) FROM sender_logo_cache`), 0)
})

test('mail cache rebuild clears all reconstructible mail state', async () => {
  const db = await createDatabase()

  rebuildMailCache(db)

  assert.equal(scalar(db, `SELECT COUNT(*) FROM messages`), 0)
  assert.equal(scalar(db, `SELECT COUNT(*) FROM messages_fts`), 0)
  assert.equal(scalar(db, `SELECT COUNT(*) FROM attachments`), 0)
  assert.equal(scalar(db, `SELECT COUNT(*) FROM folders`), 0)
  assert.equal(scalar(db, `SELECT COUNT(*) FROM sync_state`), 0)
})

test('mail cache rebuild refuses to discard state while sync operations are pending', async () => {
  const db = await createDatabase()
  db.run(`INSERT INTO sync_queue VALUES (1)`)

  assert.throws(() => rebuildMailCache(db), /pending-sync-operations/)
  assert.equal(scalar(db, `SELECT COUNT(*) FROM messages`), 1)
})
