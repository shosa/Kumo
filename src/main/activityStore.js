const VALID_STATUSES = new Set(['running', 'success', 'warning', 'error'])

export function normalizeActivity(entry, now = Date.now()) {
  return {
    account_email: entry.account_email || null,
    category: entry.category || 'system',
    status: VALID_STATUSES.has(entry.status) ? entry.status : 'success',
    title: String(entry.title || ''),
    detail: entry.detail ? String(entry.detail) : null,
    operation: entry.operation || null,
    retryable: entry.retryable ? 1 : 0,
    metadata_json: JSON.stringify(entry.metadata || {}),
    created_at: entry.created_at || now
  }
}

export function trimActivities(entries, limit = 300) {
  return [...entries]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit)
}
