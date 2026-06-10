import React, { useEffect, useCallback, useState } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import {
  IconCalendar, IconClock, IconPin, IconEdit, IconChevronLeft, IconChevronRight,
  IconSync, IconCheck, IconCompose, IconTrash, IconClose
} from './Icons'

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

function formatEventTime(ev, locale) {
  if (ev.all_day) return ev.type === 'task' ? '—' : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(ev.start_ts))
  const fmt = d => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d)
  return `${fmt(new Date(ev.start_ts))} – ${fmt(new Date(ev.end_ts))}`
}

function formatEventDate(ev, locale) {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ev.start_ts))
}

function groupEventsByDate(events, locale) {
  const groups = {}
  for (const ev of events) {
    const d = new Date(ev.start_ts)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!groups[key]) {
      groups[key] = {
        label: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(d),
        events: []
      }
    }
    groups[key].events.push(ev)
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => group)
}

function toInputDate(timestamp, allDay) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (allDay) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-')
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function fromInputDate(value, allDay) {
  if (!value) return 0
  return allDay
    ? new Date(`${value}T00:00:00`).getTime()
    : new Date(value).getTime()
}

function CalendarEditor({ item, sources, accountEmail, onClose, onSaved, t }) {
  const writableSources = sources.filter(source => source.writable !== 0)
  const defaultSource = writableSources.find(source =>
    item?.type === 'task' ? source.supports_todos : source.supports_events
  ) || writableSources[0]
  const [form, setForm] = useState(() => ({
    ...item,
    type: item?.type || 'event',
    title: item?.title || '',
    description: item?.description || '',
    location: item?.location || '',
    all_day: Boolean(item?.all_day),
    start: toInputDate(item?.start_ts || Date.now(), Boolean(item?.all_day)),
    end: toInputDate(item?.end_ts || Date.now() + 3600000, Boolean(item?.all_day)),
    calendar_href: item?.calendar_href || defaultSource?.href || '',
    calendar_id: item?.calendar_id || defaultSource?.name || ''
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm(current => {
      const next = { ...current, [field]: value }
      if (field === 'calendar_href') {
        next.calendar_id = sources.find(source => source.href === value)?.name || current.calendar_id
      }
      if (field === 'all_day') {
        next.start = toInputDate(fromInputDate(current.start, current.all_day), value)
        next.end = toInputDate(fromInputDate(current.end, current.all_day), value)
      }
      return next
    })
  }

  async function save(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      account_email: accountEmail,
      start_ts: fromInputDate(form.start, form.all_day),
      end_ts: fromInputDate(form.type === 'task' ? form.start : (form.end || form.start), form.all_day),
      status: form.status || (form.type === 'task' ? 'NEEDS-ACTION' : 'CONFIRMED')
    }
    const result = await window.api.calendar.save(payload, accountEmail)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || t('calendar.saveFailed'))
      return
    }
    onSaved(result.event)
  }

  return (
    <div className="editor-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="editor-card" onSubmit={save}>
        <div className="editor-card__head">
          <div>
            <div className="editor-card__eyebrow">{t('nav.calendar')}</div>
            <h2>{item?.id ? t('calendar.edit') : t('calendar.new')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}><IconClose size={17} /></button>
        </div>
        <div className="editor-grid">
          <label className="editor-grid__wide"><span>{t('calendar.title')}</span><input autoFocus value={form.title} onChange={event => update('title', event.target.value)} /></label>
          <label><span>{t('calendar.type')}</span><select value={form.type} onChange={event => update('type', event.target.value)}><option value="event">{t('calendar.event')}</option><option value="task">{t('calendar.task')}</option></select></label>
          <label><span>{t('calendar.calendar')}</span><select value={form.calendar_href} onChange={event => update('calendar_href', event.target.value)}>{writableSources.filter(source => form.type === 'task' ? source.supports_todos : source.supports_events !== 0).map(source => <option key={source.href} value={source.href}>{source.name}</option>)}</select></label>
          <label className="editor-check"><input type="checkbox" checked={form.all_day} onChange={event => update('all_day', event.target.checked)} /><span>{t('calendar.allDay')}</span></label>
          <span />
          <label><span>{form.type === 'task' ? t('calendar.due') : t('calendar.start')}</span><input type={form.all_day ? 'date' : 'datetime-local'} value={form.start} onChange={event => update('start', event.target.value)} /></label>
          {form.type !== 'task' && <label><span>{t('calendar.end')}</span><input type={form.all_day ? 'date' : 'datetime-local'} value={form.end} onChange={event => update('end', event.target.value)} /></label>}
          {form.type !== 'task' && <label className="editor-grid__wide"><span>{t('calendar.location')}</span><input value={form.location} onChange={event => update('location', event.target.value)} /></label>}
          <label className="editor-grid__wide"><span>{t('calendar.description')}</span><textarea rows="4" value={form.description} onChange={event => update('description', event.target.value)} /></label>
        </div>
        {error && <div className="editor-error">{error}</div>}
        <div className="editor-card__actions">
          <button className="btn btn--ghost" type="button" onClick={onClose}>{t('action.cancel')}</button>
          <button className="btn btn--primary" disabled={saving} type="submit">{saving ? t('toolbar.syncing') : t('action.save')}</button>
        </div>
      </form>
    </div>
  )
}

export default function CalendarPanel() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const locale = state.settings?.language || 'it-IT'
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [viewMonth, setViewMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(null) // Date object or null = show all upcoming
  const [syncing, setSyncing] = useState(false)
  const [sources, setSources] = useState([])
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    if (state.auth.email) {
      window.api.calendar.sources(state.auth.email).then(res => {
        if (res.ok) setSources(res.sources)
      })
    }
  }, [state.auth.email])

  async function handleToggleSource(href, currentEnabled) {
    const next = !currentEnabled
    setSources(prev => prev.map(s => s.href === href ? { ...s, enabled: next ? 1 : 0 } : s))
    await window.api.calendar.toggleSource(href, next)
  }

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    dispatch({ type: 'SET_CALENDAR_SYNCING', payload: true })
    try {
      const credRes = await window.api.auth.getCredentials()
      if (credRes.ok && credRes.creds?.password) {
        await window.api.calendar.sync(credRes.creds.email, credRes.creds.password)
        // Reload sources (sync may have discovered new calendars)
        const srcRes = await window.api.calendar.sources(credRes.creds.email)
        if (srcRes.ok) setSources(srcRes.sources)
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

  const enabledHrefs = new Set(sources.filter(s => s.enabled).map(s => s.href))
  const allItems = (state.calendar.events || []).filter(i =>
    // Keep legacy rows visible, but honor the case where every loaded source is disabled.
    sources.length === 0 || !i.calendar_href || enabledHrefs.has(i.calendar_href)
  )
  const onlyEvents = allItems.filter(i => i.type !== 'task')
  const onlyTodos  = allItems.filter(i => i.type === 'task')

  // Filter events: if a day is selected show only that day's events, otherwise show upcoming
  const visibleEvents = (() => {
    const sorted = onlyEvents.slice().sort((a, b) => a.start_ts - b.start_ts)
    if (selectedDay) {
      const sel = new Date(currentYear, currentMonth, selectedDay)
      return sorted.filter(ev => {
        const d = new Date(ev.start_ts)
        return d.getDate() === sel.getDate() && d.getMonth() === sel.getMonth() && d.getFullYear() === sel.getFullYear()
      })
    }
    return sorted.filter(ev => ev.end_ts >= now).slice(0, 100)
  })()

  // Todos: pending only, sorted by due date (no-due last)
  const visibleTodos = onlyTodos
    .filter(td => td.status !== 'COMPLETED')
    .sort((a, b) => {
      if (!a.end_ts && !b.end_ts) return 0
      if (!a.end_ts) return 1
      if (!b.end_ts) return -1
      return a.end_ts - b.end_ts
    })

  const eventGroups = groupEventsByDate(visibleEvents, locale)
  const hasWritableEventCalendar = sources.some(source => source.writable !== 0 && source.supports_events !== 0)
  const selectedSource = selectedEvent
    ? sources.find(source => source.href === selectedEvent.calendar_href)
    : null
  const selectedEventWritable = !selectedSource || selectedSource.writable !== 0

  function handleSaved(event) {
    const events = state.calendar.events.some(item => item.id === event.id)
      ? state.calendar.events.map(item => item.id === event.id ? event : item)
      : [...state.calendar.events, event]
    dispatch({ type: 'SET_CALENDAR_EVENTS', payload: events })
    setSelectedEvent(event)
    setEditing(null)
  }

  async function handleDelete(item) {
    if (!window.confirm(t('calendar.deleteConfirm'))) return
    const result = await window.api.calendar.delete(item, state.auth.email)
    if (!result.ok) return
    dispatch({ type: 'SET_CALENDAR_EVENTS', payload: state.calendar.events.filter(event => event.id !== item.id) })
    setSelectedEvent(null)
  }

  // Collect day numbers in current month that have events or task due dates
  const eventDays = new Set(
    allItems
      .filter(ev => {
        const d = new Date(ev.start_ts || ev.end_ts)
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
      })
      .map(ev => new Date(ev.start_ts || ev.end_ts).getDate())
  )

  return (
    <div className="cal">
      {/* Left sidebar */}
      <div className="cal__side">
        {/* Mini calendar */}
        <div className="mini">
          <div className="mini__nav">
            <button className="icon-btn" onClick={prevMonth}><IconChevronLeft size={16} /></button>
            <span className="mini__month">
              {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewMonth)}
            </span>
            <button className="icon-btn" onClick={nextMonth}><IconChevronRight size={16} /></button>
            <button
              className="icon-btn"
              onClick={handleSync}
              disabled={syncing}
              title={syncing ? t('toolbar.syncing') : t('toolbar.sync')}
            >
              <IconSync size={16} className={syncing ? 'spin' : ''} />
            </button>
            <button className="icon-btn" disabled={!hasWritableEventCalendar} onClick={() => setEditing({})} title={t('calendar.new')}>
              <IconCompose size={16} />
            </button>
          </div>
          <div className="mini__grid">
            {Array.from({ length: 7 }, (_, i) => {
              // Monday-first: 0=Mon…6=Sun → day offset from a known Monday
              const d = new Date(2024, 0, 1 + i) // 2024-01-01 is Monday
              return <div key={i} className="mini__dn">{new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(d)}</div>
            })}
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
                  title={eventDays.has(d) ? t('calendar.hasEvents') : ''}
                >{d}</div>
            )}
          </div>
        </div>

        {/* Calendar sources */}
        {sources.length > 0 && (
          <div className="cal__sources">
            {sources.map(src => (
              <div key={src.href} className="cal__src">
                <span className="cal__src-dot" style={{ background: src.color || 'var(--accent)' }} />
                <span className="cal__src-name">{src.name}</span>
                <button
                  className={`cal__src-toggle${src.enabled ? ' on' : ''}`}
                  onClick={() => handleToggleSource(src.href, src.enabled)}
                  title={src.enabled ? t('calendar.hide') : t('calendar.show')}
                >
                  <span />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Event agenda */}
        <div className="cal__events scroll">
          {state.calendar.loading && eventGroups.length === 0 && visibleTodos.length === 0 ? (
            <div className="cal__detail-empty"><div className="spinner" /></div>
          ) : eventGroups.length === 0 && visibleTodos.length === 0 ? (
            <div className="cal__detail-empty">
              <IconCalendar size={44} />
              <span>{t('calendar.noEvents')}</span>
            </div>
          ) : (
            <>
              {eventGroups.map(group => (
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
                          {formatEventTime(ev, locale)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {visibleTodos.length > 0 && (
                <div className="cal__todos-section">
                  <div className="cal__daylabel cal__daylabel--todos">{t('calendar.reminders')}</div>
                  {visibleTodos.map((td, i) => (
                    <div
                      key={i}
                      className={`ev ev--todo${selectedEvent === td ? ' active' : ''}`}
                      onClick={() => setSelectedEvent(td)}
                    >
                      <div className="ev__check">
                        {td.status === 'COMPLETED' && <IconCheck size={9} />}
                      </div>
                      <div>
                        <div className="ev__title">{td.title}</div>
                        {td.end_ts > 0 && (
                          <div className="ev__time">
                            <IconClock size={12} />
                            {new Date(td.end_ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right detail */}
      <div className="cal__detail scroll">
        {selectedEvent ? (
          selectedEvent.type === 'task' ? (
            <div className="fadein" key={selectedEvent.id}>
              {selectedEventWritable && (
                <div className="detail-toolbar">
                  <button className="btn btn--ghost" onClick={() => setEditing(selectedEvent)}><IconEdit size={14} /> {t('calendar.edit')}</button>
                  <button className="btn btn--ghost btn--danger" onClick={() => handleDelete(selectedEvent)}><IconTrash size={14} /> {t('action.delete')}</button>
                </div>
              )}
              <div className="evd__chip evd__chip--task">
                <div className="ev__check ev__check--lg">{selectedEvent.status === 'COMPLETED' && <IconCheck size={11} />}</div>
                {t('calendar.reminders')}
              </div>
              <div className={`evd__title${selectedEvent.status === 'COMPLETED' ? ' evd__title--done' : ''}`}>{selectedEvent.title}</div>
              {selectedEvent.end_ts > 0 && (
                <div className="evd__row">
                  <IconClock size={17} />
                  {new Date(selectedEvent.end_ts).toLocaleDateString(state.settings?.language || 'it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
              {selectedEvent.description && (
                <div className="evd__row"><IconEdit size={17} /> {selectedEvent.description}</div>
              )}
            </div>
          ) : (
            <div className="fadein" key={selectedEvent.title || selectedEvent.summary}>
              {selectedEventWritable && (
                <div className="detail-toolbar">
                  <button className="btn btn--ghost" onClick={() => setEditing(selectedEvent)}><IconEdit size={14} /> {t('calendar.edit')}</button>
                  <button className="btn btn--ghost btn--danger" onClick={() => handleDelete(selectedEvent)}><IconTrash size={14} /> {t('action.delete')}</button>
                </div>
              )}
              <div className="evd__chip">
                <span style={{ width: 8, height: 8, borderRadius: 99, background: selectedEvent.color || 'var(--accent)', display: 'inline-block' }} />
                {formatEventDate(selectedEvent, locale)}
              </div>
              <div className="evd__title">{selectedEvent.title || selectedEvent.summary}</div>
              <div className="evd__row"><IconClock size={17} /> {formatEventTime(selectedEvent, locale)}</div>
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
          )
        ) : (
          <div className="cal__detail-empty">
            <IconCalendar size={48} />
            <span>{t('calendar.selectEvent')}</span>
          </div>
        )}
      </div>
      {editing && (
        <CalendarEditor
          item={editing.id ? editing : null}
          sources={sources}
          accountEmail={state.auth.email}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
