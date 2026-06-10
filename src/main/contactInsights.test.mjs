import test from 'node:test'
import assert from 'node:assert/strict'
import { eventMatchesContact, normalizeContactEmail, messageMatchesContact } from './contactInsights.js'

test('normalizes contact email addresses', () => {
  assert.equal(normalizeContactEmail('  Marco@Example.COM '), 'marco@example.com')
})

test('matches message participants by full normalized address only', () => {
  const message = {
    from_email: 'sender@example.com',
    to_addresses: '["Marco <marco@example.com>"]',
    cc_addresses: '[]'
  }
  assert.equal(messageMatchesContact(message, 'marco@example.com'), true)
  assert.equal(messageMatchesContact(message, 'marc@example.com'), false)
})

test('matches calendar participants by full normalized address only', () => {
  const event = {
    organizer: { email: 'host@example.com', name: 'Host' },
    attendees: [
      { email: 'person@example.com', name: 'Person' },
      'Other <other@example.com>'
    ]
  }
  assert.equal(eventMatchesContact(event, 'person@example.com'), true)
  assert.equal(eventMatchesContact(event, 'son@example.com'), false)
  assert.equal(eventMatchesContact(event, 'host@example.com'), true)
})
