import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAdvancedSearchWhere } from './searchCriteria.js'

test('builds parameterized predicates for advanced message filters', () => {
  const result = buildAdvancedSearchWhere({
    text: 'invoice',
    from: 'amazon.it',
    to: 'me@example.com',
    subject: 'order',
    dateFrom: '2026-06-01',
    dateTo: '2026-06-10',
    unread: true,
    starred: true,
    hasAttachments: true
  })

  assert.match(result.clause, /from_email LIKE \?/)
  assert.match(result.clause, /to_addresses LIKE \?/)
  assert.match(result.clause, /has_attachments = 1/)
  assert.match(result.clause, /flags NOT LIKE \?/)
  assert.match(result.clause, /flags LIKE \?/)
  assert.ok(result.params.includes('%amazon.it%'))
  assert.ok(result.params.includes('%me@example.com%'))
  assert.ok(result.params.every(value => !String(value).includes(' OR 1=1')))
})

test('returns a harmless predicate for empty criteria', () => {
  assert.deepEqual(buildAdvancedSearchWhere({}), { clause: '1 = 1', params: [] })
})

