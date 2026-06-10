import test from 'node:test'
import assert from 'node:assert/strict'
import { detectAppointment } from './appointmentDetection.js'

const now = new Date(2026, 5, 10, 12).getTime()

test('detects an explicit Italian appointment with duration and location', () => {
  const result = detectAppointment(
    'Ci vediamo venerdì 12 giugno alle 15:30 per un’ora su Microsoft Teams.',
    { now, locale: 'it-IT', subject: 'Riunione Kumo' }
  )

  assert.equal(result.title, 'Riunione Kumo')
  assert.equal(new Date(result.start_ts).getHours(), 15)
  assert.equal(result.end_ts - result.start_ts, 60 * 60 * 1000)
  assert.equal(result.location, 'Microsoft Teams')
})

test('detects tomorrow with an English time', () => {
  const result = detectAppointment(
    'Let us meet tomorrow at 9:00 for 30 minutes.',
    { now, locale: 'en-US', subject: 'Planning' }
  )

  assert.equal(new Date(result.start_ts).getDate(), 11)
  assert.equal(result.end_ts - result.start_ts, 30 * 60 * 1000)
})

test('does not suggest an event when no date and time are present', () => {
  assert.equal(detectAppointment('Thanks, talk soon.', { now, locale: 'en-US' }), null)
})
