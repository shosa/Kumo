import { isIP } from 'node:net'

const OUTGOING_SPECIAL_USES = new Set(['\\sent', '\\drafts', '\\outbox'])
const OUTGOING_FOLDER_NAMES = /(^|[\/._ -])(sent|drafts?|outbox|posta inviata|bozze)([\/._ -]|$)/i
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml'
])

export function extractSenderDomain(sender) {
  const raw = String(sender || '').trim()
  const bracketAddress = raw.match(/<([^<>]+)>/)?.[1]
  const address = (bracketAddress || raw).trim().toLowerCase()
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1) return null

  const domain = address.slice(at + 1).replace(/\.$/, '')
  if (!domain.includes('.') || !/^[a-z0-9.-]+$/.test(domain)) return null
  if (domain.split('.').some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
    return null
  }
  return domain
}

export function isLogoExcludedFolder(folder) {
  if (!folder) return false
  const specialUse = String(folder.special_use || folder.specialUse || '').toLowerCase()
  if (OUTGOING_SPECIAL_USES.has(specialUse)) return true
  return OUTGOING_FOLDER_NAMES.test(String(folder.path || folder.name || folder))
}

export function parseBimiLocation(txtValue) {
  const value = Array.isArray(txtValue) ? txtValue.join('') : String(txtValue || '')
  const fields = Object.fromEntries(
    value.split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const equals = part.indexOf('=')
        return equals < 0
          ? [part.toLowerCase(), '']
          : [part.slice(0, equals).trim().toLowerCase(), part.slice(equals + 1).trim()]
      })
  )
  if (String(fields.v || '').toUpperCase() !== 'BIMI1' || !fields.l) return null
  try {
    const url = new URL(fields.l)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : ''
}

function iconSize(tag) {
  const sizes = readAttribute(tag, 'sizes')
  if (/^any$/i.test(sizes)) return 512
  const values = [...sizes.matchAll(/(\d+)x(\d+)/gi)]
  return values.reduce((largest, match) => Math.max(largest, Number(match[1]), Number(match[2])), 0)
}

export function parseFaviconLinks(html, baseUrl) {
  const candidates = []
  const linkTags = String(html || '').match(/<link\b[^>]*>/gi) || []
  for (const tag of linkTags) {
    const rel = readAttribute(tag, 'rel').toLowerCase()
    if (!rel.split(/\s+/).some(value => value === 'icon' || value === 'apple-touch-icon')) continue
    const href = readAttribute(tag, 'href')
    if (!href || href.startsWith('data:')) continue
    try {
      const url = new URL(href, baseUrl)
      if (url.protocol !== 'https:') continue
      candidates.push({ url: url.href, size: iconSize(tag) })
    } catch {
      // Ignore malformed icon declarations.
    }
  }
  return [...new Map(
    candidates
      .sort((a, b) => b.size - a.size)
      .map(candidate => [candidate.url, candidate.url])
  ).values()]
}

function isPublicIpv4(address) {
  const [a, b] = address.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a >= 224) return false
  return true
}

function isPublicIpv6(address) {
  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized === '::1') return false
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false
  if (/^fe[89ab]/.test(normalized)) return false
  if (normalized.startsWith('ff')) return false
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  return mappedIpv4 ? isPublicIpv4(mappedIpv4) : true
}

export function isPublicIpAddress(address) {
  const version = isIP(String(address || ''))
  if (version === 4) return isPublicIpv4(address)
  if (version === 6) return isPublicIpv6(address)
  return false
}

export function normalizeImageContentType(contentType) {
  const normalized = String(contentType || '').split(';', 1)[0].trim().toLowerCase()
  return SUPPORTED_IMAGE_TYPES.has(normalized) ? normalized : null
}

export function detectImageContentType(bytes) {
  const data = Buffer.from(bytes || [])
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 6 && /^GIF8[79]a$/.test(data.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp'
  if (data.length >= 4 && data[0] === 0 && data[1] === 0 && data[2] === 1 && data[3] === 0) {
    return 'image/x-icon'
  }
  if (/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(data.subarray(0, 512).toString('utf8'))) {
    return 'image/svg+xml'
  }
  return null
}

export function sanitizeBimiSvg(svg) {
  let sanitized = String(svg || '')
    .replace(/^\uFEFF/, '')
    .replace(/<\?xml\b[^?]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
  if (!/^<svg\b/i.test(sanitized) || !/<\/svg>\s*$/i.test(sanitized)) return null

  sanitized = sanitized
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<(?:image|use|iframe|object|embed|audio|video)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:image|use|iframe|object|embed|audio|video)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|xlink:href)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/url\s*\(\s*(['"]?)(?:https?:|data:|\/\/)[^)]*\1\s*\)/gi, 'none')

  const withoutSvgNamespace = sanitized.replace(
    /\s+xmlns\s*=\s*(?:"http:\/\/www\.w3\.org\/2000\/svg"|'http:\/\/www\.w3\.org\/2000\/svg')/i,
    ''
  ).replace(
    /\s+xmlns:xlink\s*=\s*(?:"http:\/\/www\.w3\.org\/1999\/xlink"|'http:\/\/www\.w3\.org\/1999\/xlink')/i,
    ''
  )
  return /(?:https?:|javascript:|data:|\/\/)/i.test(withoutSvgNamespace) ? null : sanitized
}
