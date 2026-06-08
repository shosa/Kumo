export function normalizeConnectionStatus(payload) {
  if (typeof payload === 'string') return payload
  return payload?.status || 'disconnected'
}
