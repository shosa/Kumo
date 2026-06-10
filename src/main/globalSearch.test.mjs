import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGlobalQuery, shapeGlobalSearchResults } from './globalSearch.js'

test('normalizes global search queries without FTS control characters', () => {
  assert.equal(normalizeGlobalQuery('  Amazon "fattura" OR giugno  '), 'Amazon fattura giugno')
})

test('shapes every global result group with stable limits', () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ id: index }))
  const result = shapeGlobalSearchResults({
    messages: many,
    attachments: many,
    contacts: many,
    events: many
  }, 6)

  assert.deepEqual(Object.keys(result), ['messages', 'attachments', 'contacts', 'events'])
  assert.equal(result.messages.length, 6)
  assert.equal(result.attachments.length, 6)
})
