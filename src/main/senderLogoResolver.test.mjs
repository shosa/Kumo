import test from 'node:test'
import assert from 'node:assert/strict'
import { createSenderLogoResolver } from './senderLogoResolver.js'

function response(body, contentType, status = 200, url = 'https://example.com/') {
  const bytes = Buffer.from(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-type') return contentType
        if (name.toLowerCase() === 'content-length') return String(bytes.length)
        return null
      }
    },
    arrayBuffer: async () => bytes,
    text: async () => bytes.toString('utf8')
  }
}

function memoryCache() {
  const values = new Map()
  return {
    get: domain => values.get(domain) || null,
    set: (domain, value) => values.set(domain, value),
    clear: () => values.clear()
  }
}

test('prefers a valid BIMI logo and returns a validated data URL', async () => {
  const requests = []
  const resolver = createSenderLogoResolver({
    resolveTxt: async name => {
      assert.equal(name, 'default._bimi.example.com')
      return [['v=BIMI1; l=https://cdn.example.com/logo.svg']]
    },
    lookup: async () => [{ address: '8.8.8.8' }],
    fetch: async url => {
      requests.push(url)
      return response(
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
        'image/svg+xml',
        200,
        url
      )
    },
    cache: memoryCache()
  })

  const result = await resolver.get('news@example.com')
  assert.equal(result.source, 'bimi')
  assert.match(result.dataUrl, /^data:image\/svg\+xml;base64,/)
  assert.deepEqual(requests, ['https://cdn.example.com/logo.svg'])
})

test('falls back from missing BIMI to a declared favicon before favicon.ico', async () => {
  const requests = []
  const resolver = createSenderLogoResolver({
    resolveTxt: async () => { throw Object.assign(new Error('not found'), { code: 'ENODATA' }) },
    lookup: async () => [{ address: '8.8.8.8' }],
    fetch: async url => {
      requests.push(url)
      if (url === 'https://example.com/') {
        return response('<link rel="icon" href="/brand.png" sizes="64x64">', 'text/html', 200, url)
      }
      return response('png', 'image/png', 200, url)
    },
    cache: memoryCache()
  })

  const result = await resolver.get('hello@example.com')
  assert.equal(result.source, 'favicon')
  assert.deepEqual(requests, ['https://example.com/', 'https://example.com/brand.png'])
})

test('inherits the default BIMI record from the organizational domain', async () => {
  const dnsQueries = []
  const requests = []
  const resolver = createSenderLogoResolver({
    resolveTxt: async name => {
      dnsQueries.push(name)
      if (name === 'default._bimi.nvidiagaming.nvidia.com') {
        throw Object.assign(new Error('not found'), { code: 'ENODATA' })
      }
      assert.equal(name, 'default._bimi.nvidia.com')
      return [['v=BIMI1; l=https://www.nvidia.com/logo.svg']]
    },
    lookup: async () => [{ address: '8.8.8.8' }],
    fetch: async url => {
      requests.push(url)
      return response(
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
        'image/svg+xml',
        200,
        url
      )
    },
    cache: memoryCache()
  })

  const result = await resolver.get('noreply@nvidiagaming.nvidia.com')

  assert.equal(result.source, 'bimi')
  assert.deepEqual(dnsQueries, [
    'default._bimi.nvidiagaming.nvidia.com',
    'default._bimi.nvidia.com'
  ])
  assert.deepEqual(requests, ['https://www.nvidia.com/logo.svg'])
})

test('caches misses and deduplicates concurrent discovery', async () => {
  let txtCalls = 0
  let fetchCalls = 0
  const resolver = createSenderLogoResolver({
    resolveTxt: async () => {
      txtCalls++
      await new Promise(resolve => setTimeout(resolve, 5))
      throw Object.assign(new Error('not found'), { code: 'ENODATA' })
    },
    lookup: async () => [{ address: '8.8.8.8' }],
    fetch: async url => {
      fetchCalls++
      return response('', 'text/html', 404, url)
    },
    cache: memoryCache(),
    now: () => 1_000
  })

  const [first, second] = await Promise.all([
    resolver.get('one@example.com'),
    resolver.get('two@example.com')
  ])
  const third = await resolver.get('three@example.com')

  assert.equal(first.dataUrl, null)
  assert.deepEqual(second, first)
  assert.equal(third.dataUrl, null)
  assert.equal(third.cached, true)
  assert.equal(txtCalls, 1)
  assert.equal(fetchCalls, 2)
})

test('rejects destinations resolving to private addresses', async () => {
  let fetchCalls = 0
  const resolver = createSenderLogoResolver({
    resolveTxt: async () => [['v=BIMI1; l=https://internal.example/logo.svg']],
    lookup: async () => [{ address: '127.0.0.1' }],
    fetch: async () => {
      fetchCalls++
      return response('png', 'image/png')
    },
    cache: memoryCache()
  })

  const result = await resolver.get('sender@example.com')
  assert.equal(result.dataUrl, null)
  assert.equal(fetchCalls, 0)
})
