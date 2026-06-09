import { resolveTxt as defaultResolveTxt } from 'node:dns/promises'
import { lookup as defaultLookup } from 'node:dns/promises'
import { getDomain } from 'tldts'
import {
  extractSenderDomain,
  detectImageContentType,
  isPublicIpAddress,
  normalizeImageContentType,
  parseBimiLocation,
  parseFaviconLinks,
  sanitizeBimiSvg
} from './senderLogo.js'

const DEFAULT_MAX_BYTES = 512 * 1024
const DEFAULT_TIMEOUT_MS = 4_000
const DEFAULT_POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_MAX_REDIRECTS = 3
const CACHE_KEY_VERSION = 'v2'

function emptyResult(domain, cached = false) {
  return { domain, dataUrl: null, source: null, cached }
}

function toDataUrl(bytes, contentType) {
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`
}

async function readBoundedBody(response, maxBytes) {
  const declaredLength = Number(response.headers?.get?.('content-length') || 0)
  if (declaredLength > maxBytes) throw new Error('response-too-large')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > maxBytes) throw new Error('response-too-large')
  return bytes
}

async function resolvePublicHost(url, lookup) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  const list = Array.isArray(addresses) ? addresses : [addresses]
  if (list.length === 0 || list.some(item => !isPublicIpAddress(item?.address || item))) {
    throw new Error('non-public-destination')
  }
}

async function secureFetch(urlValue, options) {
  const {
    fetch,
    lookup,
    timeoutMs,
    maxRedirects,
    maxBytes
  } = options

  let currentUrl = new URL(urlValue)
  if (currentUrl.protocol !== 'https:') throw new Error('https-required')

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    await resolvePublicHost(currentUrl, lookup)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
      response = await fetch(currentUrl.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,text/html;q=0.5',
          'User-Agent': 'Kumo/2 sender-logo'
        }
      })
    } finally {
      clearTimeout(timer)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.('location')
      if (!location || redirectCount === maxRedirects) throw new Error('redirect-limit')
      const nextUrl = new URL(location, currentUrl)
      if (nextUrl.protocol !== 'https:') throw new Error('https-downgrade')
      currentUrl = nextUrl
      continue
    }

    if (!response.ok) throw new Error(`http-${response.status}`)
    return {
      response,
      bytes: await readBoundedBody(response, maxBytes),
      finalUrl: response.url || currentUrl.href
    }
  }

  throw new Error('redirect-limit')
}

function createDataResult(domain, source, bytes, contentType) {
  if (contentType === 'image/svg+xml') {
    const sanitized = sanitizeBimiSvg(Buffer.from(bytes).toString('utf8'))
    if (!sanitized) throw new Error('unsafe-svg')
    return {
      domain,
      source,
      dataUrl: toDataUrl(Buffer.from(sanitized, 'utf8'), contentType)
    }
  }
  return { domain, source, dataUrl: toDataUrl(bytes, contentType) }
}

export function createSenderLogoResolver(options = {}) {
  const resolveTxt = options.resolveTxt || defaultResolveTxt
  const lookup = options.lookup || defaultLookup
  const fetchFn = options.fetch || globalThis.fetch
  const cache = options.cache || { get: () => null, set: () => {} }
  const now = options.now || Date.now
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const positiveTtlMs = options.positiveTtlMs || DEFAULT_POSITIVE_TTL_MS
  const negativeTtlMs = options.negativeTtlMs || DEFAULT_NEGATIVE_TTL_MS
  const log = options.log || (() => {})
  const inFlight = new Map()

  const fetchOptions = {
    fetch: fetchFn,
    lookup,
    timeoutMs,
    maxRedirects,
    maxBytes
  }

  async function fetchImage(domain, url, source) {
    const { response, bytes } = await secureFetch(url, fetchOptions)
    const contentType = normalizeImageContentType(response.headers?.get?.('content-type')) ||
      detectImageContentType(bytes)
    if (!contentType) throw new Error('unsupported-image-type')
    return createDataResult(domain, source, bytes, contentType)
  }

  async function discover(domain) {
    const organizationalDomain = getDomain(domain, { allowPrivateDomains: true })
    const bimiDomains = organizationalDomain && organizationalDomain !== domain
      ? [domain, organizationalDomain]
      : [domain]

    for (const bimiDomain of bimiDomains) {
      try {
        const records = await resolveTxt(`default._bimi.${bimiDomain}`)
        for (const record of records || []) {
          const location = parseBimiLocation(record)
          if (!location) continue
          try {
            const result = await fetchImage(domain, location, 'bimi')
            log('resolved', { domain, source: 'bimi', recordDomain: bimiDomain })
            return result
          } catch (error) {
            log('bimi-failed', { domain, recordDomain: bimiDomain, reason: error.message })
          }
        }
      } catch (error) {
        log('bimi-missing', {
          domain,
          recordDomain: bimiDomain,
          reason: error.code || error.message
        })
      }
    }

    const homeUrl = `https://${domain}/`
    try {
      const { response, bytes, finalUrl } = await secureFetch(homeUrl, fetchOptions)
      const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase()
      if (contentType.startsWith('text/html')) {
        const candidates = parseFaviconLinks(bytes.toString('utf8'), finalUrl)
        for (const candidate of candidates) {
          try {
            const result = await fetchImage(domain, candidate, 'favicon')
            log('resolved', { domain, source: 'favicon' })
            return result
          } catch (error) {
            log('favicon-candidate-failed', { domain, reason: error.message })
          }
        }
      }
    } catch (error) {
      log('site-icon-discovery-failed', { domain, reason: error.message })
    }

    try {
      const result = await fetchImage(domain, `https://${domain}/favicon.ico`, 'favicon')
      log('resolved', { domain, source: 'favicon.ico' })
      return result
    } catch (error) {
      log('favicon-missing', { domain, reason: error.message })
      return emptyResult(domain)
    }
  }

  async function resolveDomain(domain) {
    const cacheKey = `${CACHE_KEY_VERSION}:${domain}`
    const cached = await cache.get(cacheKey)
    if (cached && Number(cached.expiresAt) > now()) {
      return { ...emptyResult(domain, true), ...cached.result, cached: true }
    }

    const result = await discover(domain)
    await cache.set(cacheKey, {
      result,
      expiresAt: now() + (result.dataUrl ? positiveTtlMs : negativeTtlMs)
    })
    return result
  }

  return {
    async get(sender) {
      const domain = extractSenderDomain(sender)
      if (!domain) return emptyResult(null)
      if (inFlight.has(domain)) return inFlight.get(domain)

      const promise = resolveDomain(domain).finally(() => inFlight.delete(domain))
      inFlight.set(domain, promise)
      return promise
    }
  }
}
