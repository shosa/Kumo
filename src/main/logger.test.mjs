import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeLogText,
  formatContext,
  formatLogLine
} from './logger.js'

test('converts punctuation that breaks in Windows consoles to ASCII', () => {
  assert.equal(
    sanitizeLogText('Connessione… pronta — INBOX → Trash “ok”'),
    'Connessione... pronta - INBOX -> Trash "ok"'
  )
})

test('formats structured context and omits empty values', () => {
  assert.equal(
    formatContext({ op: 'bulkDelete', folder: 'INBOX', uid: null, retry: 0 }),
    'op=bulkDelete folder="INBOX" retry=0'
  )
})

test('formats a stable plain-text log line with milliseconds', () => {
  const line = formatLogLine(
    'SYNC',
    'Operazione completata',
    { op: 'bulkDelete', durationMs: 125 },
    new Date('2026-06-08T14:43:16.042Z')
  )

  assert.equal(
    line,
    '16:43:16.042 [SYNC] Operazione completata | op=bulkDelete durationMs=125'
  )
})
