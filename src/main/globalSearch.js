export function normalizeGlobalQuery(value) {
  return String(value || '')
    .replace(/["'()[\]{}:*^~|<>]/g, ' ')
    .replace(/\b(?:AND|OR|NOT)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function shapeGlobalSearchResults(groups, limit = 8) {
  return {
    messages: (groups.messages || []).slice(0, limit),
    attachments: (groups.attachments || []).slice(0, limit),
    contacts: (groups.contacts || []).slice(0, limit),
    events: (groups.events || []).slice(0, limit)
  }
}
