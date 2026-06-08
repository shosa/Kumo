import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConnectionStatus } from './connectionStatus.js'

test('accepts legacy string connection events', () => {
  assert.equal(normalizeConnectionStatus('connected'), 'connected')
})

test('extracts status from account-aware connection events', () => {
  assert.equal(
    normalizeConnectionStatus({ status: 'reconnecting', account: 'user@icloud.com' }),
    'reconnecting'
  )
})

test('falls back to disconnected for invalid events', () => {
  assert.equal(normalizeConnectionStatus(null), 'disconnected')
})
