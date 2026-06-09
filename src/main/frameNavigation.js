export function isLocalAppUrl(url, { rendererUrl = null } = {}) {
  const value = String(url || '')
  if (value.startsWith('file://')) return true
  if (value.startsWith('kumo-local://')) return true
  return Boolean(rendererUrl && value.startsWith(rendererUrl))
}

export function shouldBlockFrameNavigation(url, options = {}) {
  return !isLocalAppUrl(url, options)
}
