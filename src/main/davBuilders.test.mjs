import test from 'node:test'
import assert from 'node:assert/strict'
import { buildVCard, parseVCard } from './carddav/client.js'
import {
  buildCalendarObject,
  buildCalendarReply,
  parseICalEvents
} from './caldav/client.js'

test('builds and parses editable vCards', () => {
  const { uid, raw } = buildVCard({
    id: 'contact-1',
    display_name: 'Ada Lovelace',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone: '+39 123',
    notes: 'Line one\nLine two'
  })

  assert.equal(uid, 'contact-1')
  const parsed = parseVCard(raw)
  assert.equal(parsed.display_name, 'Ada Lovelace')
  assert.equal(parsed.email, 'ada@example.com')
  assert.equal(parsed.phone, '+39 123')
  assert.equal(parsed.notes, 'Line one\nLine two')
})

test('round-trips calendar events and attendees', () => {
  const start = new Date(2026, 5, 12, 9, 30).getTime()
  const end = new Date(2026, 5, 12, 10, 30).getTime()
  const { raw } = buildCalendarObject({
    id: 'event-1',
    title: 'Planning',
    start_ts: start,
    end_ts: end,
    location: 'Room 2',
    organizer: { email: 'owner@example.com', name: 'Owner' },
    attendees: [{ email: 'guest@example.com', name: 'Guest', partstat: 'ACCEPTED' }]
  })

  const [event] = parseICalEvents(raw)
  assert.equal(event.id, 'event-1')
  assert.equal(event.title, 'Planning')
  assert.equal(event.location, 'Room 2')
  assert.equal(event.organizer.email, 'owner@example.com')
  assert.equal(event.attendees[0].partstat, 'ACCEPTED')
})

test('builds RFC-compatible RSVP replies', () => {
  const reply = buildCalendarReply({
    id: 'invite-1',
    title: 'Review',
    start_ts: Date.UTC(2026, 5, 12, 9),
    end_ts: Date.UTC(2026, 5, 12, 10),
    organizer: { email: 'owner@example.com' }
  }, 'declined', 'guest@example.com', 'Guest')

  assert.match(reply, /METHOD:REPLY/)
  assert.match(reply, /PARTSTAT=DECLINED/)
  assert.match(reply, /MAILTO:guest@example\.com/)
})
