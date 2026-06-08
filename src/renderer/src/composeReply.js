function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function sanitizeQuotedHtml(html) {
  return String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
}

function interpolate(template, args) {
  return args.reduce(
    (result, value, index) => result.replace(`{${index}}`, String(value)),
    template
  )
}

export function buildQuotedMessage(mode, message, body, options = {}) {
  if (!message || mode === 'new') return ''

  const locale = options.locale || 'en-US'
  const translate = options.translate || ((key, ...args) => {
    const fallback = {
      'compose.quote.wrote': 'On {0}, {1} wrote:',
      'compose.quote.forwarded': '---------- Forwarded message ----------',
      'compose.quote.from': 'From',
      'compose.quote.date': 'Date',
      'compose.quote.subject': 'Subject',
      'compose.quote.to': 'To'
    }
    return interpolate(fallback[key] || key, args)
  })
  const sender = message.from_name || message.from_email || ''
  const date = message.date ? new Date(message.date).toLocaleString(locale) : ''
  const original = body?.html
    ? sanitizeQuotedHtml(body.html)
    : `<pre style="white-space:pre-wrap;margin:0">${escapeHtml(body?.text || '')}</pre>`

  if (mode === 'forward') {
    const recipients = (message.to_addresses || [])
      .map(address => address.name || address.email)
      .filter(Boolean)
      .join(', ')

    return [
      '<div style="margin-top:16px">',
      `<p>${escapeHtml(translate('compose.quote.forwarded'))}</p>`,
      `<p>${escapeHtml(translate('compose.quote.from'))}: ${escapeHtml(sender)} &lt;${escapeHtml(message.from_email || '')}&gt;<br>`,
      `${escapeHtml(translate('compose.quote.date'))}: ${escapeHtml(date)}<br>`,
      `${escapeHtml(translate('compose.quote.subject'))}: ${escapeHtml(message.subject || '')}<br>`,
      `${escapeHtml(translate('compose.quote.to'))}: ${escapeHtml(recipients)}</p>`,
      original,
      '</div>'
    ].join('')
  }

  return [
    '<div style="margin-top:16px">',
    `<p>${escapeHtml(translate('compose.quote.wrote', date, sender))}</p>`,
    '<div style="border-left:3px solid #d2d2d7;margin-left:8px;padding-left:12px">',
    original,
    '</div></div>'
  ].join('')
}

export function combineComposeHtml(editableHtml, quotedHtml) {
  return `${editableHtml || ''}${quotedHtml || ''}`
}
