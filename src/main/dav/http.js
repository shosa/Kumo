import { request } from 'https'
import { URL } from 'url'

export function assertSafeDavUrl(value) {
  const parsed = value instanceof URL ? value : new URL(value)
  const hostname = parsed.hostname.toLowerCase()
  if (parsed.protocol !== 'https:' || (hostname !== 'icloud.com' && !hostname.endsWith('.icloud.com'))) {
    throw new Error(`Unsafe DAV target: ${parsed.href}`)
  }
  return parsed
}

export function davRequest(url, method, auth, body, headers = {}, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const parsed = assertSafeDavUrl(url)
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${auth.user}:${auth.pass}`).toString('base64'),
        'Content-Type': 'application/xml; charset=utf-8',
        Depth: '1',
        ...headers
      }
    }
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body)

    const req = request(opts, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')) })
    if (body) req.write(body)
    req.end()
  })
}

export async function followDavRedirects(url, method, auth, body, headers, maxRedirects = 5, timeoutMs = 20000) {
  let current = assertSafeDavUrl(url).href
  for (let i = 0; i < maxRedirects; i++) {
    const res = await davRequest(current, method, auth, body, headers, timeoutMs)
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = assertSafeDavUrl(new URL(res.headers.location, current)).href
    } else {
      return { ...res, finalUrl: current }
    }
  }
  throw new Error('Too many redirects')
}
