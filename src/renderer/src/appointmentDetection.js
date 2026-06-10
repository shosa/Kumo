const MONTHS = {
  gennaio: 0, january: 0,
  febbraio: 1, february: 1,
  marzo: 2, march: 2,
  aprile: 3, april: 3,
  maggio: 4, may: 4,
  giugno: 5, june: 5,
  luglio: 6, july: 6,
  agosto: 7, august: 7,
  settembre: 8, september: 8,
  ottobre: 9, october: 9,
  novembre: 10, november: 10,
  dicembre: 11, december: 11
}

function parseDate(text, now) {
  const base = new Date(now)
  if (/\b(?:domani|tomorrow)\b/i.test(text)) {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1)
  }
  if (/\b(?:oggi|today)\b/i.test(text)) {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate())
  }

  const named = text.match(/\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i)
  if (named) {
    return new Date(
      Number(named[3]) || base.getFullYear(),
      MONTHS[named[2].toLowerCase()],
      Number(named[1])
    )
  }

  const numeric = text.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/)
  if (!numeric) return null
  let year = Number(numeric[3]) || base.getFullYear()
  if (year < 100) year += 2000
  return new Date(year, Number(numeric[2]) - 1, Number(numeric[1]))
}

function parseTime(text) {
  const match = text.match(/\b(?:alle|at)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] || 0)
  if (match[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12
  if (match[3]?.toLowerCase() === 'am' && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

function parseDuration(text) {
  if (/\b(?:un['’]?\s*ora|one hour|an hour)\b/i.test(text)) return 60
  const minutes = text.match(/\b(?:per|for)\s+(\d{1,3})\s*(?:minuti|minutes|mins|min)\b/i)
  if (minutes) return Math.max(5, Math.min(480, Number(minutes[1])))
  const hours = text.match(/\b(?:per|for)\s+(\d+(?:[.,]\d+)?)\s*(?:ore|hours|hrs)\b/i)
  if (hours) return Math.max(15, Math.min(480, Number(hours[1].replace(',', '.')) * 60))
  return 60
}

function detectLocation(text) {
  const known = text.match(/\b(Microsoft Teams|Google Meet|Zoom)\b/i)
  if (known) return known[1]
  const url = text.match(/https?:\/\/[^\s<>"']+/i)
  return url?.[0] || ''
}

export function detectAppointment(text, { now = Date.now(), subject = '' } = {}) {
  const source = String(text || '').replace(/\s+/g, ' ').trim()
  const date = parseDate(source, now)
  const time = parseTime(source)
  if (!date || !time) return null

  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.hour, time.minute)
  const durationMinutes = parseDuration(source)
  return {
    title: subject?.trim() || 'Meeting',
    start_ts: start.getTime(),
    end_ts: start.getTime() + durationMinutes * 60000,
    all_day: false,
    location: detectLocation(source),
    confidence: 'high'
  }
}
