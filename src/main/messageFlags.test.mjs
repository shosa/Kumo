import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFlagChange, parseStoredFlags } from './messageFlags.js'

test('adding read state preserves unrelated flags', () => {
  assert.deepEqual(
    applyFlagChange(['\\Flagged'], '\\Seen', true),
    ['\\Flagged', '\\Seen']
  )
})

test('removing read state preserves unrelated flags', () => {
  assert.deepEqual(
    applyFlagChange(['\\Seen', '\\Flagged'], '\\Seen', false),
    ['\\Flagged']
  )
})

test('parses stored flags and tolerates invalid data', () => {
  assert.deepEqual(parseStoredFlags('["\\\\Seen"]'), ['\\Seen'])
  assert.deepEqual(parseStoredFlags('invalid'), [])
})
