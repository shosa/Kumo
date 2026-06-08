export function parseStoredFlags(value) {
  if (Array.isArray(value)) return value
  try { return JSON.parse(value || '[]') }
  catch { return [] }
}

export function applyFlagChange(flags, flag, add) {
  return add
    ? [...new Set([...(flags || []), flag])]
    : (flags || []).filter(existing => existing !== flag)
}
