import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeActivity, trimActivities } from './activityStore.js'

test('normalizes activity entries for persistence', () => {
  const entry = normalizeActivity({
    category: 'sync',
    status: 'success',
    title: 'Folder synchronized',
    detail: 'INBOX',
    metadata: { folder: 'INBOX' }
  }, 123)

  assert.equal(entry.created_at, 123)
  assert.equal(entry.status, 'success')
  assert.equal(entry.metadata_json, '{"folder":"INBOX"}')
})

test('keeps only the newest bounded activity entries', () => {
  const entries = [{ created_at: 1 }, { created_at: 3 }, { created_at: 2 }]
  assert.deepEqual(trimActivities(entries, 2).map(entry => entry.created_at), [3, 2])
})
