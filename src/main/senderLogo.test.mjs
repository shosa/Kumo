import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractSenderDomain,
  isLogoExcludedFolder,
  parseBimiLocation,
  parseFaviconLinks,
  isPublicIpAddress,
  detectImageContentType,
  normalizeImageContentType,
  sanitizeBimiSvg
} from './senderLogo.js'

test('extracts and normalizes a sender domain without exposing the address', () => {
  assert.equal(extractSenderDomain('Store <news@Sub.Example.COM>'), 'sub.example.com')
  assert.equal(extractSenderDomain('invalid'), null)
  assert.equal(extractSenderDomain('a@localhost'), null)
})

test('excludes outgoing special-use folders from logo discovery', () => {
  assert.equal(isLogoExcludedFolder({ special_use: '\\Sent', path: 'Sent Messages' }), true)
  assert.equal(isLogoExcludedFolder({ special_use: '\\Drafts', path: 'Drafts' }), true)
  assert.equal(isLogoExcludedFolder({ special_use: '\\Outbox', path: 'Outbox' }), true)
  assert.equal(isLogoExcludedFolder({ special_use: '\\Inbox', path: 'INBOX' }), false)
})

test('parses the BIMI logo location from a valid TXT value', () => {
  assert.equal(
    parseBimiLocation('v=BIMI1; l=https://cdn.example.com/logo.svg; a=;'),
    'https://cdn.example.com/logo.svg'
  )
  assert.equal(parseBimiLocation('v=DMARC1; p=reject'), null)
  assert.equal(parseBimiLocation('v=BIMI1; l=http://example.com/logo.svg'), null)
})

test('orders declared favicon candidates by useful size and resolves relative URLs', () => {
  const html = `
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="icon" sizes="32x32" href="/small.png">
    <link rel="apple-touch-icon" sizes="180x180" href="https://cdn.example.com/touch.png">
  `
  assert.deepEqual(parseFaviconLinks(html, 'https://example.com/'), [
    'https://cdn.example.com/touch.png',
    'https://example.com/small.png',
    'https://example.com/favicon.ico'
  ])
})

test('rejects non-public IP destinations', () => {
  assert.equal(isPublicIpAddress('8.8.8.8'), true)
  assert.equal(isPublicIpAddress('1.1.1.1'), true)
  assert.equal(isPublicIpAddress('127.0.0.1'), false)
  assert.equal(isPublicIpAddress('10.1.2.3'), false)
  assert.equal(isPublicIpAddress('192.168.1.2'), false)
  assert.equal(isPublicIpAddress('169.254.1.1'), false)
  assert.equal(isPublicIpAddress('::1'), false)
  assert.equal(isPublicIpAddress('fc00::1'), false)
  assert.equal(isPublicIpAddress('2606:4700:4700::1111'), true)
})

test('accepts supported image types and sanitizes passive BIMI SVG', () => {
  assert.equal(normalizeImageContentType('image/png; charset=binary'), 'image/png')
  assert.equal(normalizeImageContentType('image/svg+xml'), 'image/svg+xml')
  assert.equal(normalizeImageContentType('text/html'), null)
  assert.equal(detectImageContentType(Buffer.from([0, 0, 1, 0, 1, 0])), 'image/x-icon')
  assert.equal(
    detectImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/png'
  )

  const safe = sanitizeBimiSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://tracker.example/pixel"/><path d="M0 0"/></svg>'
  )
  assert.match(safe, /^<svg/)
  assert.doesNotMatch(safe, /script|tracker\.example|onload|foreignObject/i)
  assert.match(safe, /<path/)
})

test('accepts BIMI Tiny PS files with XML declarations and standard namespaces', () => {
  const safe = sanitizeBimiSvg(`<?xml version="1.0" encoding="utf-8"?>
    <!-- Generator: SVG Export -->
    <svg version="1.2" baseProfile="tiny-ps"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      xmlns="http://www.w3.org/2000/svg">
      <title>NVIDIA</title>
      <path d="M0 0"/>
    </svg>`)

  assert.match(safe, /^<svg/)
  assert.match(safe, /baseProfile="tiny-ps"/)
  assert.doesNotMatch(safe, /<\?xml|<!--/)
})
