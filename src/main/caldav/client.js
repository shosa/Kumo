import { request } from 'https'
import { URL } from 'url'
import { randomUUID } from 'crypto'
import { logCal, logWarn } from '../logger.js'
import { assertSafeDavUrl } from '../dav/http.js'

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function davRequest(url, method, auth, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${auth.user}:${auth.pass}`).toString('base64'),
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': '1',
        ...headers
      }
    }
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body)

    const req = request(opts, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    req.setTimeout(20000, () => { req.destroy(new Error('timeout')) })
    if (body) req.write(body)
    req.end()
  })
}

async function followRedirects(url, method, auth, body, headers, maxRedirects = 5) {
  let current = assertSafeDavUrl(url).href
  for (let i = 0; i < maxRedirects; i++) {
    const res = await davRequest(current, method, auth, body, headers)
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      const loc = res.headers.location
      current = assertSafeDavUrl(new URL(loc, current)).href
    } else {
      return { ...res, finalUrl: current }
    }
  }
  throw new Error('Too many redirects')
}

// ── iCal parser ───────────────────────────────────────────────────────────────

function unfold(raw) {
  return raw.replace(/\r?\n[ \t]/g, '')
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function escapeICal(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function unescapeICal(value) {
  return String(value || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\([\\,;])/g, '$1')
}

function formatICalDate(timestamp, allDay = false) {
  const date = new Date(Number(timestamp) || Date.now())
  if (allDay) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('')
  }
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function addLocalDays(timestamp, days) {
  const date = new Date(Number(timestamp) || Date.now())
  date.setDate(date.getDate() + days)
  return date.getTime()
}

function parseMailAddress(rawProp, value) {
  const cn = rawProp.match(/(?:^|;)CN="?([^";]+)"?/i)?.[1] || ''
  const partstat = rawProp.match(/(?:^|;)PARTSTAT=([^;:]+)/i)?.[1]?.toUpperCase() || null
  const email = value.replace(/^MAILTO:/i, '')
  return { email, name: cn, partstat }
}

function buildCalendarComponent(item) {
  const uid = item.ical_uid || item.id || randomUUID()
  const type = item.type === 'task' ? 'VTODO' : 'VEVENT'
  const lines = [
    `BEGIN:${type}`,
    `UID:${escapeICal(uid)}`,
    `DTSTAMP:${formatICalDate(Date.now())}`,
    `SUMMARY:${escapeICal(item.title)}`
  ]
  if (item.recurrence_id) lines.push(`RECURRENCE-ID:${item.recurrence_id}`)
  if (type === 'VEVENT') {
    const allDayEnd = item.all_day
      ? addLocalDays(item.end_ts || item.start_ts, 1)
      : item.end_ts || item.start_ts
    lines.push(
      item.all_day
        ? `DTSTART;VALUE=DATE:${formatICalDate(item.start_ts, true)}`
        : `DTSTART:${formatICalDate(item.start_ts)}`,
      item.all_day
        ? `DTEND;VALUE=DATE:${formatICalDate(allDayEnd, true)}`
        : `DTEND:${formatICalDate(allDayEnd)}`,
      `STATUS:${item.status || 'CONFIRMED'}`
    )
    if (item.location) lines.push(`LOCATION:${escapeICal(item.location)}`)
    if (item.organizer) {
      const organizer = typeof item.organizer === 'string' ? { email: item.organizer } : item.organizer
      lines.push(`${organizer.name ? `ORGANIZER;CN="${escapeICal(organizer.name)}"` : 'ORGANIZER'}:MAILTO:${organizer.email}`)
    }
    for (const attendeeValue of item.attendees || []) {
      const attendee = typeof attendeeValue === 'string' ? { email: attendeeValue } : attendeeValue
      if (!attendee.email) continue
      const params = [
        attendee.name ? `CN="${escapeICal(attendee.name)}"` : null,
        attendee.partstat ? `PARTSTAT=${attendee.partstat}` : null,
        'ROLE=REQ-PARTICIPANT'
      ].filter(Boolean).join(';')
      lines.push(`ATTENDEE;${params}:MAILTO:${attendee.email}`)
    }
  } else {
    const due = item.end_ts || item.start_ts
    if (due) {
      lines.push(item.all_day
        ? `DUE;VALUE=DATE:${formatICalDate(due, true)}`
        : `DUE:${formatICalDate(due)}`)
    }
    lines.push(`STATUS:${item.status || 'NEEDS-ACTION'}`)
  }
  if (item.description) lines.push(`DESCRIPTION:${escapeICal(item.description)}`)
  if (item.rrule) lines.push(`RRULE:${item.rrule}`)
  lines.push(`END:${type}`)
  return { uid, type, lines }
}

function componentIdentity(lines) {
  const uid = lines.find(line => /^UID:/i.test(line))?.slice(4) || ''
  const recurrenceId = lines.find(line => /^RECURRENCE-ID(?:;[^:]*)?:/i.test(line))?.split(':').slice(1).join(':') || ''
  return { uid: unescapeICal(uid), recurrenceId }
}

function replaceCalendarComponent(raw, item, componentLines) {
  const lines = unfold(raw).replace(/\r/g, '').split('\n')
  const targetUid = item.ical_uid || item.id
  const targetRecurrenceId = item.recurrence_id || ''
  const type = componentLines[0].slice('BEGIN:'.length)
  let start = -1
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toUpperCase() === `BEGIN:${type}`) {
      if (depth === 0) start = i
      depth++
    } else if (lines[i].toUpperCase() === `END:${type}` && depth > 0) {
      depth--
      if (depth === 0 && start >= 0) {
        const block = lines.slice(start, i + 1)
        const identity = componentIdentity(block)
        if (identity.uid === targetUid && identity.recurrenceId === targetRecurrenceId) {
          const replaceProps = new Set([
            'DTSTAMP', 'SUMMARY', 'DTSTART', 'DTEND', 'DUE', 'STATUS',
            'LOCATION', 'ORGANIZER', 'ATTENDEE', 'DESCRIPTION', 'RRULE'
          ])
          const preserved = [block[0]]
          let nestedDepth = 0
          for (const line of block.slice(1, -1)) {
            if (/^BEGIN:/i.test(line)) nestedDepth++
            const prop = line.split(/[;:]/, 1)[0].toUpperCase()
            if (nestedDepth > 0 || !replaceProps.has(prop)) preserved.push(line)
            if (/^END:/i.test(line)) nestedDepth--
          }
          const insertion = componentLines.slice(1, -1).filter(line => {
            const prop = line.split(/[;:]/, 1)[0].toUpperCase()
            return replaceProps.has(prop)
          })
          const nestedIndex = preserved.findIndex((line, index) => index > 0 && /^BEGIN:/i.test(line))
          const insertAt = nestedIndex < 0 ? preserved.length : nestedIndex
          preserved.splice(insertAt, 0, ...insertion)
          preserved.push(block.at(-1))
          lines.splice(start, block.length, ...preserved)
          return `${lines.join('\r\n').replace(/\r?\n*$/, '')}\r\n`
        }
        start = -1
      }
    }
  }
  throw new Error('The original iCalendar component could not be found')
}

export function buildCalendarObject(item) {
  const component = buildCalendarComponent(item)
  const raw = item.raw_ical
    ? replaceCalendarComponent(item.raw_ical, item, component.lines)
    : [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Kumo//Mail Client//EN',
        'CALSCALE:GREGORIAN',
        ...component.lines,
        'END:VCALENDAR',
        ''
      ].join('\r\n')
  return { uid: component.uid, raw }
}

export function buildCalendarReply(invite, response, attendeeEmail, attendeeName = '') {
  const partstat = {
    accepted: 'ACCEPTED',
    tentative: 'TENTATIVE',
    declined: 'DECLINED'
  }[response]
  if (!partstat) throw new Error('Unsupported RSVP response')
  const uid = invite.ical_uid || invite.id
  const organizer = typeof invite.organizer === 'string'
    ? { email: invite.organizer }
    : invite.organizer
  const attendeeParams = [
    attendeeName ? `CN="${escapeICal(attendeeName)}"` : null,
    `PARTSTAT=${partstat}`,
    'ROLE=REQ-PARTICIPANT'
  ].filter(Boolean).join(';')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kumo//Mail Client//EN',
    'METHOD:REPLY',
    'BEGIN:VEVENT',
    `UID:${escapeICal(uid)}`,
    `DTSTAMP:${formatICalDate(Date.now())}`
  ]
  if (invite.sequence != null) lines.push(`SEQUENCE:${invite.sequence}`)
  if (invite.recurrence_id) lines.push(`RECURRENCE-ID:${invite.recurrence_id}`)
  if (invite.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${formatICalDate(invite.start_ts, true)}`)
  } else {
    lines.push(`DTSTART:${formatICalDate(invite.start_ts)}`)
  }
  if (organizer?.email) lines.push(`ORGANIZER:MAILTO:${organizer.email}`)
  lines.push(
    `ATTENDEE;${attendeeParams}:MAILTO:${attendeeEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  )
  return lines.join('\r\n')
}

// Convert wall-clock time in a named IANA timezone to UTC milliseconds.
// Uses the "fake-UTC mirror" trick: no dependencies required.
function wallClockToUTC(year, month, day, hour, min, sec, tzid) {
  const utcFake = Date.UTC(year, month - 1, day, hour, min, sec)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tzid,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  }).formatToParts(new Date(utcFake))
  const get = type => parseInt(parts.find(p => p.type === type)?.value || '0')
  const tzFake = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return 2 * utcFake - tzFake
}

function parseICalDate(val, tzid) {
  if (!val) return null
  const allDay = /^\d{8}$/.test(val)
  if (allDay) {
    const y = parseInt(val.slice(0, 4))
    const m = parseInt(val.slice(4, 6)) - 1
    const d = parseInt(val.slice(6, 8))
    return { ts: new Date(y, m, d).getTime(), allDay: true }
  }
  const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (m) {
    const yr = parseInt(m[1]), mo = parseInt(m[2]), dy = parseInt(m[3])
    const hr = parseInt(m[4]), mn = parseInt(m[5]), sc = parseInt(m[6])
    if (m[7] === 'Z') {
      return { ts: Date.UTC(yr, mo - 1, dy, hr, mn, sc), allDay: false }
    }
    if (tzid) {
      try {
        return { ts: wallClockToUTC(yr, mo, dy, hr, mn, sc, tzid), allDay: false }
      } catch {
        // Unknown TZID — fall through to local time
      }
    }
    return { ts: new Date(yr, mo - 1, dy, hr, mn, sc).getTime(), allDay: false }
  }
  return null
}

function _parseProp(rawProp, val) {
  const tzidMatch = rawProp.match(/TZID=([^;:]+)/i)
  return parseICalDate(val.split(';').pop(), tzidMatch?.[1] || null)
}

export function parseICalEvents(icsData) {
  const decoded = decodeXmlEntities(icsData)
  const unfolded = unfold(decoded)
  const items = []
  const method = unfolded.match(/(?:^|\r?\n)METHOD:([^\r\n]+)/i)?.[1]?.toUpperCase() || null

  // ── VEVENT ──────────────────────────────────────────────────────────────────
  for (const block of unfolded.split(/BEGIN:VEVENT/i).slice(1)) {
    const ev = {}
    for (const line of block.split(/\r?\n/)) {
      if (line.toUpperCase().startsWith('END:VEVENT')) break
      const ci = line.indexOf(':')
      if (ci < 0) continue
      const rawProp = line.slice(0, ci)
      const rawVal = line.slice(ci + 1)
      const val = unescapeICal(rawVal)
      const prop = rawProp.split(';')[0].toUpperCase()
      switch (prop) {
        case 'UID':         ev.uid = val; break
        case 'SUMMARY':     ev.title = val; break
        case 'DESCRIPTION': ev.description = val; break
        case 'LOCATION':    ev.location = val; break
        case 'STATUS':      ev.status = val.toUpperCase(); break
        case 'RRULE':       ev.rrule = val; break
        case 'RECURRENCE-ID': ev.recurrence_id = rawVal; break
        case 'SEQUENCE':     ev.sequence = Number.parseInt(val, 10) || 0; break
        case 'ORGANIZER':   ev.organizer = parseMailAddress(rawProp, val); break
        case 'DTSTART': { const p = _parseProp(rawProp, val); if (p) { ev.start_ts = p.ts; ev.all_day = p.allDay } break }
        case 'DTEND':   { const p = _parseProp(rawProp, val); if (p)   ev.end_ts = p.ts; break }
        case 'ATTENDEE': { if (!ev.attendees) ev.attendees = []; ev.attendees.push(parseMailAddress(rawProp, val)); break }
      }
    }
    if (ev.uid && ev.title) {
      const localId = ev.recurrence_id ? `${ev.uid}::${ev.recurrence_id}` : ev.uid
      const endTs = ev.all_day && ev.end_ts > ev.start_ts
        ? addLocalDays(ev.end_ts, -1)
        : ev.end_ts || ev.start_ts || 0
      items.push({
        id: localId, ical_uid: ev.uid, recurrence_id: ev.recurrence_id || null,
        sequence: ev.sequence || 0, raw_ical: decoded, type: 'event',
        title: ev.title, description: ev.description || null, location: ev.location || null,
        start_ts: ev.start_ts || 0, end_ts: endTs,
        all_day: ev.all_day || false, rrule: ev.rrule || null,
        status: ev.status || 'CONFIRMED', organizer: ev.organizer || null,
        attendees: ev.attendees || [], method
      })
    }
  }

  // ── VTODO (Promemoria) ───────────────────────────────────────────────────────
  for (const block of unfolded.split(/BEGIN:VTODO/i).slice(1)) {
    const td = {}
    for (const line of block.split(/\r?\n/)) {
      if (line.toUpperCase().startsWith('END:VTODO')) break
      const ci = line.indexOf(':')
      if (ci < 0) continue
      const rawProp = line.slice(0, ci)
      const val = unescapeICal(line.slice(ci + 1))
      const prop = rawProp.split(';')[0].toUpperCase()
      switch (prop) {
        case 'UID':         td.uid = val; break
        case 'SUMMARY':     td.title = val; break
        case 'DESCRIPTION': td.description = val; break
        case 'STATUS':      td.status = val.toUpperCase(); break
        case 'DTSTART': { const p = _parseProp(rawProp, val); if (p) { td.start_ts = p.ts; td.all_day = p.allDay } break }
        case 'DUE':     { const p = _parseProp(rawProp, val); if (p) { td.end_ts = p.ts; td.due_allDay = p.allDay } break }
      }
    }
    if (td.uid && td.title) {
      const ts = td.start_ts || td.end_ts || 0
      items.push({
        id: td.uid, ical_uid: td.uid, recurrence_id: null,
        sequence: 0, raw_ical: decoded, type: 'task',
        title: td.title, description: td.description || null, location: null,
        start_ts: ts, end_ts: td.end_ts || ts,
        all_day: td.all_day ?? td.due_allDay ?? true,
        rrule: null, status: td.status || 'NEEDS-ACTION',
        organizer: null, attendees: []
      })
    }
  }

  return items
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function extractXmlProp(xml, tag) {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i')
  const m = xml.match(re)
  return m ? m[1].trim() : null
}

function extractAllMatches(xml, tag) {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'gi')
  const matches = []
  let m
  while ((m = re.exec(xml)) !== null) matches.push(m[1])
  return matches
}

function hasWritePrivilege(responseXml) {
  const privileges = extractXmlProp(responseXml, 'current-user-privilege-set')
  if (!privileges) return true
  return /<(?:[^:>]+:)?write(?:-content)?(?:\s|\/|>)/i.test(privileges)
}

function describeDavError(response) {
  const errorBlock = extractXmlProp(response.body || '', 'error') || response.body || ''
  const names = [...errorBlock.matchAll(/<(?:(?:[^:>]+):)?([a-z][a-z0-9-]*)\b[^>]*\/?>/gi)]
    .map(match => match[1])
    .filter(name => !['error', 'response', 'responsedescription'].includes(name.toLowerCase()))
  const detail = [...new Set(names)].slice(0, 3).join(', ')
  return detail ? `${response.status} (${detail})` : String(response.status)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calendarNameFromHref(href) {
  const slug = href.replace(/\/$/, '').split('/').pop() || ''
  const KNOWN = { home: 'Casa', work: 'Lavoro', tasks: 'Promemoria', personal: 'Personale', family: 'Famiglia' }
  return KNOWN[slug.toLowerCase()] || decodeURIComponent(slug).replace(/[_-]/g, ' ')
}

function calendarColorFromXml(xml) {
  // Apple sends #RRGGBBAA — strip alpha
  const raw = extractXmlProp(xml, 'calendar-color')
  if (!raw) return null
  const m = raw.trim().match(/^#([0-9a-f]{6})/i)
  return m ? '#' + m[1] : null
}

// ── Discovery ─────────────────────────────────────────────────────────────────

export async function discoverCalendars(email, password) {
  const auth = { user: email, pass: password }

  const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<propfind xmlns="DAV:">
  <prop><current-user-principal/></prop>
</propfind>`

  let res = await followRedirects(
    'https://caldav.icloud.com/.well-known/caldav',
    'PROPFIND', auth, propfindBody, { 'Depth': '0' }
  )

  let principalUrl = extractXmlProp(res.body, 'current-user-principal')
  if (principalUrl) {
    // The element contains <href>...</href> — extract the path from within it
    const nested = extractXmlProp(principalUrl, 'href')
    if (nested) principalUrl = nested.trim()
  }
  if (!principalUrl) {
    const hrefs = extractAllMatches(res.body, 'href')
    principalUrl = hrefs.find(h => h.includes('/principal') || h.length > 5) || null
  }
  if (!principalUrl) principalUrl = new URL(res.finalUrl).origin + '/'

  const principalFull = principalUrl.startsWith('http')
    ? principalUrl
    : new URL(principalUrl, res.finalUrl).href
  logCal(`Principal URL: ${principalFull}`)

  // Get calendar home
  res = await followRedirects(principalFull, 'PROPFIND', auth, `<?xml version="1.0" encoding="UTF-8"?>
<propfind xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <prop>
    <cal:calendar-home-set/>
    <cal:schedule-outbox-URL/>
  </prop>
</propfind>`, { 'Depth': '0' })

  let scheduleOutbox = extractXmlProp(res.body, 'schedule-outbox-URL')
  if (scheduleOutbox) scheduleOutbox = extractXmlProp(scheduleOutbox, 'href') || scheduleOutbox
  const scheduleOutboxUrl = scheduleOutbox
    ? new URL(scheduleOutbox.trim(), principalFull).href
    : null

  let calHome = extractXmlProp(res.body, 'calendar-home-set')
  if (calHome) {
    const hrefMatch = calHome.match(/<(?:[^:>]+:)?href[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?href>/i)
    if (hrefMatch) calHome = hrefMatch[1].trim()
  }
  if (!calHome) calHome = principalFull

  const calHomeFull = calHome.startsWith('http')
    ? calHome
    : new URL(calHome, principalFull).href
  logCal(`Calendar home: ${calHomeFull}`)

  // List calendars
  res = await followRedirects(calHomeFull, 'PROPFIND', auth, `<?xml version="1.0" encoding="UTF-8"?>
<propfind xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <prop>
    <resourcetype/>
    <displayname/>
    <supported-calendar-component-set/>
    <current-user-privilege-set/>
  </prop>
</propfind>`)

  // System collections that never contain user data
  const SYSTEM_PATHS = ['/inbox/', '/outbox/', '/notification/']

  const responses = extractAllMatches(res.body, 'response')
  const calendars = []
  for (const r of responses) {
    if (r.includes('calendar') || r.includes('CALENDAR')) {
      const href = extractXmlProp(r, 'href')
      if (!href || href.endsWith('calendars/')) continue

      // Skip known system collection paths
      if (SYSTEM_PATHS.some(p => href.includes(p))) continue

      const compSet = extractXmlProp(r, 'supported-calendar-component-set')
      const supportsEvents = !compSet || compSet.includes('VEVENT')
      const supportsTodos  = compSet?.includes('VTODO') || false

      // Skip if neither events nor tasks are supported
      if (compSet && !supportsEvents && !supportsTodos) continue

      const full = href.startsWith('http') ? href : new URL(href, calHomeFull).href
      const displayName = extractXmlProp(r, 'displayname')?.trim()
      const name = displayName || calendarNameFromHref(full)
      const color = calendarColorFromXml(r)
      const writable = hasWritePrivilege(r)
      calendars.push({ href: full, name, color, supportsEvents, supportsTodos, writable })
    }
  }

  if (calendars.length === 0) {
    calendars.push({
      href: calHomeFull,
      name: 'Calendar',
      supportsEvents: true,
      supportsTodos: false,
      writable: false
    })
  }

  Object.defineProperty(calendars, 'scheduleOutboxUrl', {
    value: scheduleOutboxUrl,
    enumerable: false
  })
  return calendars
}

// ── Sync ──────────────────────────────────────────────────────────────────────

async function fetchCalendarEvents(calUrl, auth) {
  logCal(`Fetching events from "${calUrl}"`)
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<cal:calendar-query xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <cal:calendar-data/>
  </d:prop>
  <cal:filter>
    <cal:comp-filter name="VCALENDAR">
      <cal:comp-filter name="VEVENT"/>
    </cal:comp-filter>
  </cal:filter>
</cal:calendar-query>`

  const res = await followRedirects(calUrl, 'REPORT', auth, body, {
    'Depth': '1',
    'Content-Type': 'application/xml; charset=utf-8'
  })

  if (res.status >= 400) {
    logCal(`Calendar query failed (${res.status}), trying multiget discovery...`)
    const fallback = await followRedirects(calUrl, 'PROPFIND', auth, `<?xml version="1.0" encoding="UTF-8"?>
<propfind xmlns="DAV:">
  <prop><getetag/><resourcetype/></prop>
</propfind>`)
    if (fallback.status >= 400) {
      logCal(`PROPFIND failed (${fallback.status}), no events found`)
      return []
    }
    const hrefs = extractAllMatches(fallback.body, 'response')
      .filter(response => !/<(?:[^:>]+:)?collection(?:\s|\/|>)/i.test(response))
      .map(response => extractXmlProp(response, 'href'))
      .filter(Boolean)
    if (hrefs.length === 0) return []
    const multiget = await followRedirects(
      calUrl,
      'REPORT',
      auth,
      buildCalendarMultigetBody(hrefs),
      { 'Content-Type': 'application/xml; charset=utf-8', Depth: '0' }
    )
    if (multiget.status >= 400) throw new Error(`CalDAV multiget failed: ${multiget.status}`)
    const events = _parseEventResponses(multiget.body)
    logCal(`Calendar multiget: found ${events.length} events`)
    return events
  }

  const events = _parseEventResponses(res.body)
  logCal(`REPORT: found ${events.length} events`)
  return events
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildCalendarMultigetBody(hrefs) {
  const hrefLines = hrefs.map(href => `  <d:href>${escapeXml(href)}</d:href>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<cal:calendar-multiget xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <cal:calendar-data/>
  </d:prop>
${hrefLines}
</cal:calendar-multiget>`
}

function _parseEventResponses(xmlBody) {
  const responses = extractAllMatches(xmlBody, 'response')
  const events = []

  for (const r of responses) {
    const href = extractXmlProp(r, 'href') || ''
    const etag = (extractXmlProp(r, 'getetag') || '').replace(/"/g, '')
    const icsData = extractXmlProp(r, 'calendar-data') || ''
    if (!icsData) continue

    const parsed = parseICalEvents(icsData)
    for (const ev of parsed) {
      events.push({ ...ev, href, etag })
    }
  }

  return events
}

async function fetchCalendarTodos(calUrl, auth) {
  logCal(`Fetching reminders from "${calUrl}"`)
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<cal:calendar-query xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <cal:calendar-data/>
  </d:prop>
  <cal:filter>
    <cal:comp-filter name="VCALENDAR">
      <cal:comp-filter name="VTODO"/>
    </cal:comp-filter>
  </cal:filter>
</cal:calendar-query>`

  const res = await followRedirects(calUrl, 'REPORT', auth, body, {
    'Depth': '1',
    'Content-Type': 'application/xml; charset=utf-8'
  })

  if (res.status >= 400) {
    logCal(`VTODO REPORT failed (${res.status}), skipping`)
    return []
  }

  const items = _parseEventResponses(res.body)
  logCal(`VTODO REPORT: found ${items.length} reminders`)
  return items
}

export async function syncCalendar(email, password, { disabledHrefs = [] } = {}) {
  logCal(`Calendar sync started for ${email}`)
  const auth = { user: email, pass: password }
  const sources = await discoverCalendars(email, password)
  logCal(`Found ${sources.length} calendars: ${sources.map(c => c.name).join(', ')}`)
  const allItems = []
  const succeededHrefs = []
  const failedHrefs = []
  const disabled = new Set(disabledHrefs)

  for (const cal of sources) {
    if (disabled.has(cal.href)) continue

    try {
      const calendarItems = []
      if (cal.supportsEvents !== false) {
        const events = await fetchCalendarEvents(cal.href, auth)
        for (const ev of events) {
          calendarItems.push({
            ...ev,
            id: `${cal.href}::${ev.id}`,
            calendar_id: cal.name,
            calendar_href: cal.href
          })
        }
      }
      if (cal.supportsTodos) {
        const todos = await fetchCalendarTodos(cal.href, auth)
        for (const td of todos) {
          calendarItems.push({
            ...td,
            id: `${cal.href}::${td.id}`,
            calendar_id: cal.name,
            calendar_href: cal.href
          })
        }
      }
      allItems.push(...calendarItems)
      succeededHrefs.push(cal.href)
    } catch (err) {
      failedHrefs.push(cal.href)
      logWarn(`CalDAV calendar error "${cal.name}": ${err.message}`)
    }
  }

  logCal(`Calendar sync completed: ${allItems.filter(i => i.type !== 'task').length} events, ${allItems.filter(i => i.type === 'task').length} reminders`)
  return { items: allItems, sources, succeededHrefs, failedHrefs }
}

export async function saveCalendarItem(email, password, item) {
  const auth = { user: email, pass: password }
  const isNew = !item.href
  const calendars = await discoverCalendars(email, password)
  let targetCalendar = null
  if (item.calendar_href) {
    const requested = item.calendar_href.replace(/\/$/, '')
    targetCalendar = calendars.find(calendar => calendar.href.replace(/\/$/, '') === requested)
    if (!targetCalendar) throw new Error('Selected iCloud calendar is no longer available')
    if (targetCalendar.writable === false) throw new Error('Selected iCloud calendar is read-only')
  } else {
    targetCalendar = calendars.find(calendar =>
      calendar.writable !== false &&
      (item.type === 'task' ? calendar.supportsTodos : calendar.supportsEvents !== false)
    )
  }
  const calendarHref = targetCalendar?.href
  if (!calendarHref) throw new Error('No writable iCloud calendar found')

  const { uid, raw } = buildCalendarObject(item)
  const base = calendarHref.endsWith('/') ? calendarHref : `${calendarHref}/`
  const href = item.href
    ? new URL(item.href, base).href
    : new URL(`${encodeURIComponent(uid)}.ics`, base).href
  const headers = {
    'Content-Type': 'text/calendar; charset=utf-8',
    Depth: '0'
  }
  if (item.etag) headers['If-Match'] = `"${String(item.etag).replace(/"/g, '')}"`
  else if (isNew) headers['If-None-Match'] = '*'
  const response = await followRedirects(href, 'PUT', auth, raw, headers)
  if (response.status < 200 || response.status >= 300) {
    logWarn(`CalDAV PUT rejected for "${calendarHref}": ${describeDavError(response)}`)
    throw new Error(`CalDAV PUT failed: ${describeDavError(response)}`)
  }
  return {
    ...item,
    id: item.id || uid,
    ical_uid: uid,
    href: response.finalUrl || href,
    calendar_href: calendarHref,
    etag: String(response.headers.etag || item.etag || '').replace(/"/g, ''),
    raw_ical: raw
  }
}

export async function sendCalendarReply(email, password, invite, response, attendeeName = '') {
  const organizerEmail = typeof invite.organizer === 'string'
    ? invite.organizer
    : invite.organizer?.email
  if (!organizerEmail) throw new Error('Invitation organizer is missing')

  const calendars = await discoverCalendars(email, password)
  const outboxUrl = calendars.scheduleOutboxUrl
  if (!outboxUrl) throw new Error('The CalDAV scheduling outbox is not available')

  const content = buildCalendarReply(invite, response, email, attendeeName || email)
  const result = await followRedirects(
    outboxUrl,
    'POST',
    { user: email, pass: password },
    content,
    {
      'Content-Type': 'text/calendar; charset=utf-8',
      Originator: `mailto:${email}`,
      Recipient: `mailto:${organizerEmail}`,
      Depth: '0'
    }
  )
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`CalDAV scheduling failed: ${describeDavError(result)}`)
  }
}

export async function deleteCalendarItemRemote(email, password, item) {
  if (!item?.href) return
  const base = item.calendar_href?.endsWith('/') ? item.calendar_href : `${item.calendar_href || ''}/`
  const href = new URL(item.href, base).href
  const headers = { Depth: '0' }
  if (item.etag) headers['If-Match'] = `"${String(item.etag).replace(/"/g, '')}"`
  const response = await followRedirects(
    href,
    'DELETE',
    { user: email, pass: password },
    null,
    headers
  )
  if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
    throw new Error(`CalDAV DELETE failed: ${describeDavError(response)}`)
  }
}
