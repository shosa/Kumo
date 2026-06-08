import test from 'node:test'
import assert from 'node:assert/strict'
import { buildQuotedMessage, combineComposeHtml, sanitizeQuotedHtml } from './composeReply.js'

const message = {
  from_name: 'Sender',
  from_email: 'sender@example.com',
  date: '2026-06-08T10:00:00.000Z',
  subject: 'Table layout',
  to_addresses: [{ email: 'recipient@example.com' }]
}

test('preserves table markup instead of converting it through the editor', () => {
  const quote = buildQuotedMessage('reply', message, {
    html: '<table style="width:600px"><tr><td>Original</td></tr></table>'
  })

  assert.match(quote, /<table style="width:600px">/)
  assert.match(quote, /<td>Original<\/td>/)
})

test('removes executable content from quoted HTML', () => {
  assert.equal(
    sanitizeQuotedHtml('<script>alert(1)</script><a href="javascript:bad()" onclick="bad()">Link</a>'),
    '<a href="#">Link</a>'
  )
})

test('combines editable reply and untouched quoted HTML only at output time', () => {
  assert.equal(
    combineComposeHtml('<p>My reply</p>', '<table><tr><td>Original</td></tr></table>'),
    '<p>My reply</p><table><tr><td>Original</td></tr></table>'
  )
})

test('uses the selected locale and translated reply template', () => {
  const translations = {
    'compose.quote.wrote': 'Il giorno {0}, {1} ha scritto:'
  }
  const translate = (key, ...args) => args.reduce(
    (text, value, index) => text.replace(`{${index}}`, String(value)),
    translations[key] || key
  )

  const quote = buildQuotedMessage('reply', message, { html: '<p>Originale</p>' }, {
    locale: 'it-IT',
    translate
  })

  assert.match(quote, /Il giorno 08\/06\/2026/)
  assert.match(quote, /Sender ha scritto:/)
  assert.doesNotMatch(quote, /\bOn\b|\bwrote\b/)
})
