function countRows(db, table) {
  return Number(db.exec(`SELECT COUNT(*) FROM ${table}`)[0]?.values?.[0]?.[0] || 0)
}

function runTransaction(db, operation) {
  db.run('BEGIN')
  try {
    operation()
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
}

export function clearReclaimableCache(db) {
  runTransaction(db, () => {
    db.run(`UPDATE messages SET body_html = NULL, body_text = NULL, body_fetched = 0`)
    try { db.run(`UPDATE messages_fts SET body_text = ''`) } catch { /* FTS unavailable */ }
    db.run(`UPDATE attachments SET downloaded = 0, file_path = NULL`)
    db.run(`DELETE FROM sender_logo_cache`)
  })
}

export function rebuildMailCache(db) {
  if (countRows(db, 'sync_queue') > 0) throw new Error('pending-sync-operations')

  runTransaction(db, () => {
    db.run(`DELETE FROM messages`)
    db.run(`DELETE FROM attachments`)
    db.run(`DELETE FROM folders`)
    db.run(`DELETE FROM sync_state`)
    try { db.run(`DELETE FROM messages_fts`) } catch { /* FTS unavailable */ }
  })
}
