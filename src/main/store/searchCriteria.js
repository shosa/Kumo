function addLike(parts, params, column, value) {
  const text = String(value || '').trim()
  if (!text) return
  parts.push(`${column} LIKE ?`)
  params.push(`%${text}%`)
}

export function buildAdvancedSearchWhere(criteria = {}) {
  const parts = []
  const params = []

  const text = String(criteria.text || '').trim()
  if (text) {
    parts.push('(subject LIKE ? OR from_name LIKE ? OR from_email LIKE ? OR to_addresses LIKE ? OR snippet LIKE ?)')
    const like = `%${text}%`
    params.push(like, like, like, like, like)
  }

  addLike(parts, params, 'from_email', criteria.from)
  addLike(parts, params, 'to_addresses', criteria.to)
  addLike(parts, params, 'subject', criteria.subject)

  if (criteria.dateFrom) {
    const timestamp = new Date(`${criteria.dateFrom}T00:00:00`).getTime()
    if (Number.isFinite(timestamp)) {
      parts.push('date >= ?')
      params.push(timestamp)
    }
  }
  if (criteria.dateTo) {
    const timestamp = new Date(`${criteria.dateTo}T23:59:59.999`).getTime()
    if (Number.isFinite(timestamp)) {
      parts.push('date <= ?')
      params.push(timestamp)
    }
  }
  if (criteria.unread) {
    parts.push('flags NOT LIKE ?')
    params.push('%\\\\Seen%')
  }
  if (criteria.starred) {
    parts.push('flags LIKE ?')
    params.push('%\\\\Flagged%')
  }
  if (criteria.hasAttachments) parts.push('has_attachments = 1')

  return {
    clause: parts.length ? parts.join(' AND ') : '1 = 1',
    params
  }
}

