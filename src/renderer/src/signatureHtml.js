export function normalizeSignatureHtml(value) {
  const html = String(value || '').trim()
  const text = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<\/?p[^>]*>/gi, '')
    .replace(/&nbsp;/gi, '')
    .trim()
  return text ? html : ''
}

export function buildSignatureBlock(value) {
  const html = normalizeSignatureHtml(value)
  if (!html) return '<p><br></p>'
  return `<p><br></p><div class="kumo-signature">${html}</div>`
}

