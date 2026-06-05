import React, { useEffect, useCallback, useState } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import { IconCalendar, IconClock, IconPin, IconEdit, IconChevronLeft, IconChevronRight, IconSync } from './Icons'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const GIORNI = ['L','M','M','G','V','S','D']

const AVATAR_COLORS = ['#0071e3','#5e5ebc','#bf5af2','#ff6b35','#30a46c','#e0820b','#e5484d','#0e9bd6']
function avatarColor(name = '') {
  let h = 0; for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function getInitials(name = '') {
  const p = (name || '').trim().split(/\s+/).filter(Boolean)
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase()
  return (name || '?').slice(0, 2).toUpperCase()
}

function formatEventTime(ev) {
  if (ev.all_day) return 'Tutto il giorno'
  const start = new Date(ev.start_ts)
  const end   = new Date(ev.end_ts)
  const fmt = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${fmt(start)} – ${fmt(end)}`
}

function formatEventDate(ev) {
  const d = new Date(ev.start_ts)
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function groupEventsByDate(events) {
  const groups = {}
  for (const ev of events) {
    const d = new Date(ev.start_ts)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!groups[key]) {
      groups[key] = {
        label: d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }),
        events: []
      }
    }
    groups[key].events.push(ev)
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => group)
}

export default function CalendarPanel() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [viewMonth, setViewMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(null) // Date object or null = show all upcoming
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    dispatch({ type: 'SET_CALENDAR_SYNCING', payload: true })
    try {
      const credRes = await window.api.auth.getCredentials()
      if (credRes.ok && credRes.creds?.password) {
        await window.api.calendar.sync(credRes.creds.email, credRes.creds.password)
        const now = Date.now()
        const evRes = await window.api.calendar.events(credRes.creds.email, now - 30 * 86400000, now + 180 * 86400000)
        if (evRes.ok) dispatch({ type: 'SET_CALENDAR_EVENTS', payload: evRes.events })
      }
    } finally {
      setSyncing(false)
      dispatch({ type: 'SET_CALENDAR_SYNCING', payload: false })
    }
  }

  const currentMonth = viewMonth.getMonth()
  const currentYear = viewMonth.getFullYear()

  const today = new Date()
  const todayDate = today.getDate()
  const todayMonth = today.getMonth()
  const todayYear = today.getFullYear()

  function prevMonth() {
    setSelectedDay(null)
    setViewMonth(m => {
      const d = new Date(m)
      d.setDate(1)
      d.setMonth(d.getMonth() - 1)
      return d
    })
  }
  function nextMonth() {
    setSelectedDay(null)
    setViewMonth(m => {
      const d = new Date(m)
      d.setDate(1)
      d.setMonth(d.getMonth() + 1)
      return d
    })
  }

  const firstDow = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const calendarCells = []
  for (let i = 0; i < firstDow; i++) calendarCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d)

  const loadEvents = useCallback(async () => {
    const email = state.auth.email
    if (!email) return
    dispatch({ type: 'SET_CALENDAR_LOADING', payload: true })
    const now = Date.now()
    const res = await window.api.calendar.events(email, now - 30 * 86400000, now + 180 * 86400000)
    if (res.ok) dispatch({ type: 'SET_CALENDAR_EVENTS', payload: res.events })
    else dispatch({ type: 'SET_CALENDAR_LOADING', payload: false })
  }, [state.auth.email, dispatch])

  useEffect(() => {
    if (state.auth.isAuthenticated && state.calendar.events.length === 0) {
      loadEvents()
    }
  }, [state.auth.isAuthenticated, state.calendar.events.length, loadEvents])

  const now = Date.now()

  // Filter events: if a day is selected show only that day's events, otherwise show upcoming
  const visibleEvents = (() => {
    const all = (state.calendar.events || []).sort((a, b) => a.start_ts - b.start_ts)
    if (selectedDay) {
      const sel = new Date(currentYear, currentMonth, selectedDay)
      return all.filter(ev => {
        const d = new Date(ev.start_ts)
        return d.getDate() === sel.getDate() && d.getMonth() === sel.getMonth() && d.getFullYear() === sel.getFullYear()
      })
    }
    return all.filter(ev => ev.end_ts >= now).slice(0, 100)
  })()

  const eventGroups = groupEventsByDate(visibleEvents)

  // Collect day numbers in current month that have events
  const eventDays = new Set(
    (state.calendar.events || [])
      .filter(ev => {
        const d = new Date(ev.start_ts)
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
      })
      .map(ev => new Date(ev.start_ts).getDate())
  )

  return (
    <div className="cal">
      {/* Left sidebar */}
      <div className="cal__side">
        {/* Mini calendar */}
        <div className="mini">
          <div className="mini__nav">
            <button className="icon-btn" onClick={prevMonth}><IconChevronLeft size={16} /></button>
            <span className="mini__month">{MESI[currentMonth]} {currentYear}</span>
            <button className="icon-btn" onClick={nextMonth}><IconChevronRight size={16} /></button>
            <button
              className="icon-btn"
              onClick={handleSync}
              disabled={syncing}
              title={syncing ? t('toolbar.syncing') : t('toolbar.sync')}
            >
              <IconSync size={16} className={syncing ? 'spin' : ''} />
            </button>
          </div>
          <div className="mini__grid">
            {GIORNI.map((g, i) => <div key={i} className="mini__dn">{g}</div>)}
            {calendarCells.map((d, i) => d === null
              ? <div key={'e' + i} />
              : <div
                  key={'d' + i}
                  className={[
                    'mini__day',
                    d === todayDate && currentMonth === todayMonth && currentYear === todayYear ? 'today' : '',
                    eventDays.has(d) ? 'dot-day' : '',
                    d === selectedDay ? 'selected' : ''
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelectedDay(prev => prev === d ? null : d)}
                  title={eventDays.has(d) ? 'Ha eventi' : ''}
                >{d}</div>
            )}
          </div>
        </div>

        {/* Event agenda */}
        <div className="cal__events scroll">
          {state.calendar.loading && eventGroups.length === 0 ? (
            <div className="cal__detail-empty"><div className="spinner" /></div>
          ) : eventGroups.length === 0 ? (
            <div className="cal__detail-empty">
              <IconCalendar size={44} />
              <span>{t('calendar.noEvents')}</span>
            </div>
          ) : (
            eventGroups.map(group => (
              <div key={group.label}>
                <div className="cal__daylabel">{group.label}</div>
                {group.events.map((ev, i) => (
                  <div
                    key={i}
                    className={`ev${selectedEvent === ev ? ' active' : ''}`}
                    onClick={() => setSelectedEvent(ev)}
                  >
                    <div className="ev__rail" style={{ background: ev.color || 'var(--accent)' }} />
                    <div>
                      <div className="ev__title">{ev.title || ev.summary}</div>
                      <div className="ev__time">
                        <IconClock size={12} />
                        {formatEventTime(ev)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right detail */}
      <div className="cal__detail scroll">
        {selectedEvent ? (
          <div className="fadein" key={selectedEvent.title || selectedEvent.summary}>
            <div className="evd__chip">
              <span style={{ width: 8, height: 8, borderRadius: 99, background: selectedEvent.color || 'var(--accent)', display: 'inline-block' }} />
              {formatEventDate(selectedEvent)}
            </div>
            <div className="evd__title">{selectedEvent.title || selectedEvent.summary}</div>
            <div className="evd__row"><IconClock size={17} /> {formatEventTime(selectedEvent)}</div>
            {(selectedEvent.location || selectedEvent.where) && (
              <div className="evd__row"><IconPin size={17} /> {selectedEvent.location || selectedEvent.where}</div>
            )}
            {selectedEvent.description && (
              <div className="evd__row"><IconEdit size={17} /> {selectedEvent.description}</div>
            )}
            {selectedEvent.attendees?.length > 0 && (
              <div className="evd__attendees">
                <div className="cfield__label" style={{ marginBottom: 8 }}>{t('calendar.attendees')}</div>
                {selectedEvent.attendees.map((a, i) => (
                  <div key={i} className="evd__att">
                    <div className="evd__att-av" style={{ background: avatarColor(a.name || a.email || a) }}>
                      {getInitials(a.name || a.email || a)}
                    </div>
                    <span style={{ fontSize: 13.5 }}>{a.name || a.email || a}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="cal__detail-empty">
            <IconCalendar size={48} />
            <span>{t('calendar.selectEvent')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
