import test from 'node:test'
import assert from 'node:assert/strict'
import { buildVCard, parseVCard } from './carddav/client.js'
import {
  buildCalendarObject,
  buildCalendarReply,
  buildCalendarMultigetBody,
  parseICalEvents
} from './caldav/client.js'
import { assertSafeDavUrl } from './dav/http.js'

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

test('unescapes vCard text values', () => {
  const parsed = parseVCard([
    'BEGIN:VCARD',
    'VERSION:3.0',
    'UID:contact-2',
    'FN:Smith\\, John',
    'N:Smith\\;Senior;John;;;',
    'ORG:Example\\; Labs',
    'NOTE:First line\\nPath C:\\\\Temp',
    'END:VCARD',
    ''
  ].join('\r\n'))

  assert.equal(parsed.display_name, 'Smith, John')
  assert.equal(parsed.last_name, 'Smith;Senior')
  assert.equal(parsed.organization, 'Example; Labs')
  assert.equal(parsed.notes, 'First line\nPath C:\\Temp')
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

test('round-trips inclusive all-day dates using exclusive iCalendar DTEND', () => {
  const start = new Date(2026, 5, 12).getTime()
  const end = new Date(2026, 5, 12).getTime()
  const { raw } = buildCalendarObject({
    id: 'all-day-1',
    title: 'Holiday',
    start_ts: start,
    end_ts: end,
    all_day: true
  })

  assert.match(raw, /DTSTART;VALUE=DATE:20260612/)
  assert.match(raw, /DTEND;VALUE=DATE:20260613/)
  const [event] = parseICalEvents(raw)
  assert.equal(event.start_ts, start)
  assert.equal(event.end_ts, end)
})

test('preserves unsupported iCalendar properties and sibling recurrence components', () => {
  const raw = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Rome',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    'UID:series-1',
    'SUMMARY:Original',
    'DTSTART:20260612T090000Z',
    'DTEND:20260612T100000Z',
    'RRULE:FREQ=WEEKLY',
    'EXDATE:20260619T090000Z',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:series-1',
    'RECURRENCE-ID:20260626T090000Z',
    'SUMMARY:Exception',
    'DTSTART:20260626T110000Z',
    'DTEND:20260626T120000Z',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n')

  const [master, exception] = parseICalEvents(raw)
  assert.equal(master.id, 'series-1')
  assert.notEqual(exception.id, master.id)
  assert.equal(exception.ical_uid, 'series-1')
  assert.equal(exception.recurrence_id, '20260626T090000Z')

  const rebuilt = buildCalendarObject({ ...master, title: 'Updated' }).raw
  assert.match(rebuilt, /SUMMARY:Updated/)
  assert.match(rebuilt, /EXDATE:20260619T090000Z/)
  assert.match(rebuilt, /BEGIN:VALARM/)
  assert.match(rebuilt, /BEGIN:VTIMEZONE/)
  assert.match(rebuilt, /SUMMARY:Exception/)
})

test('builds RFC-compatible RSVP replies', () => {
  const reply = buildCalendarReply({
    id: 'invite-1',
    ical_uid: 'invite-1',
    title: 'Review',
    start_ts: Date.UTC(2026, 5, 12, 9),
    end_ts: Date.UTC(2026, 5, 12, 10),
    organizer: { email: 'owner@example.com' },
    status: 'CONFIRMED',
    sequence: 4
  }, 'declined', 'guest@example.com', 'Guest')

  assert.match(reply, /METHOD:REPLY/)
  assert.match(reply, /PARTSTAT=DECLINED/)
  assert.match(reply, /MAILTO:guest@example\.com/)
  assert.match(reply, /SEQUENCE:4/)
  assert.doesNotMatch(reply, /STATUS:CANCELLED/)
})

test('builds a standards-compliant calendar multiget request', () => {
  const body = buildCalendarMultigetBody(['/cal/a.ics', '/cal/b.ics'])
  assert.match(body, /calendar-multiget/)
  assert.match(body, /<d:href>\/cal\/a\.ics<\/d:href>/)
  assert.match(body, /<cal:calendar-data\/>/)
})

test('allows only HTTPS iCloud DAV targets', () => {
  assert.equal(assertSafeDavUrl('https://p123-caldav.icloud.com/123/calendars/').hostname, 'p123-caldav.icloud.com')
  assert.throws(() => assertSafeDavUrl('https://example.com/steal'), /Unsafe DAV target/)
  assert.throws(() => assertSafeDavUrl('http://caldav.icloud.com/'), /Unsafe DAV target/)
})
