import React, { useState, useRef, useEffect } from 'react'
import { useAppDispatch, useAppState } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import {
  IconEdit, IconReply, IconSearch, IconInbox, IconStar,
  IconSent, IconContacts, IconCalendar, IconSettings, IconChevronRight,
  IconMail
} from './Icons'

const ICON_MAP = {
  Edit: IconEdit, Reply: IconReply, Search: IconSearch,
  Inbox: IconInbox, Star: IconStar, Sent: IconSent,
  Contacts: IconContacts, Calendar: IconCalendar, Settings: IconSettings
}

export default function CommandPalette({ onClose, selectedMessage, currentTheme, currentDensity }) {
  const dispatch = useAppDispatch()
  const state = useAppState()
  const t = useTranslation()
  const email = state.auth.email
  const locale = state.settings?.language || 'en-US'

  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState({ messages: [], contacts: [], events: [] })
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  const COMMANDS = [
    { id: 'compose',     group: t('cmdk.group.actions'),      label: t('sidebar.compose'),        icon: 'Edit',     kbd: 'C' },
    { id: 'reply',       group: t('cmdk.group.actions'),      label: t('cmdk.cmd.reply'),          icon: 'Reply',    kbd: 'R' },
    { id: 'search',      group: t('cmdk.group.actions'),      label: t('cmdk.cmd.search'),         icon: 'Search' },
    { id: 'go-inbox',    group: t('cmdk.group.navigate'),     label: t('folder.inbox'),            icon: 'Inbox',    kbd: 'G I' },
    { id: 'go-starred',  group: t('cmdk.group.navigate'),     label: t('cmdk.cmd.goStarred'),      icon: 'Star' },
    { id: 'go-sent',     group: t('cmdk.group.navigate'),     label: t('folder.sent'),             icon: 'Sent' },
    { id: 'go-contacts', group: t('cmdk.group.navigate'),     label: t('nav.contacts'),            icon: 'Contacts' },
    { id: 'go-calendar', group: t('cmdk.group.navigate'),     label: t('nav.calendar'),            icon: 'Calendar' },
    { id: 'go-settings', group: t('cmdk.group.navigate'),     label: t('sidebar.settings'),        icon: 'Settings' },
    { id: 'theme',       group: t('cmdk.group.preferences'),  label: t('cmdk.cmd.toggleTheme'),    icon: 'Settings' },
    { id: 'density',     group: t('cmdk.group.preferences'),  label: t('cmdk.cmd.toggleDensity'),  icon: 'Settings' }
  ]

  // Debounced live search
  useEffect(() => {
    if (q.length < 2) {
      setResults({ messages: [], contacts: [], events: [] })
      return
    }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const [msgRes, ctcRes] = await Promise.all([
          window.api.store.searchLocal(q).catch(() => ({ ok: false })),
          window.api.contacts.search(q, email).catch(() => ({ ok: false }))
        ])
        const evts = (state.calendar.events || [])
          .filter(e =>
            e.title?.toLowerCase().includes(q.toLowerCase()) ||
            e.description?.toLowerCase().includes(q.toLowerCase())
          )
          .slice(0, 5)
        setResults({
          messages: (msgRes.ok && Array.isArray(msgRes.results) ? msgRes.results : []).slice(0, 6),
          contacts: (ctcRes.ok && Array.isArray(ctcRes.contacts) ? ctcRes.contacts : []).slice(0, 5),
          events: evts
        })
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => clearTimeout(timerRef.current)
  }, [q, email]) // intentionally omit state.calendar.events to avoid re-triggering

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setIdx(0) }, [q])

  const isSearchMode = q.length >= 2
  const filteredCmds = isSearchMode
    ? COMMANDS.filter(c => c.label.toLowerCase().includes(q.toLowerCase()))
    : COMMANDS

  // Flat list for keyboard navigation
  const allItems = []
  if (isSearchMode) {
    results.messages.forEach(m => allItems.push({ type: 'message', data: m }))
    results.contacts.forEach(c => allItems.push({ type: 'contact', data: c }))
    results.events.forEach(e => allItems.push({ type: 'event', data: e }))
  }
  filteredCmds.forEach(c => allItems.push({ type: 'command', data: c }))

  function runCommand(id) {
    if (id === 'compose')
      window.api.window.openCompose({ mode: 'new' })
    else if (id === 'reply' && selectedMessage)
      window.api.window.openCompose({ mode: 'reply', message: selectedMessage })
    else if (id === 'go-inbox' || id === 'search')
      dispatch({ type: 'SET_VIEW', payload: 'mail' })
    else if (id === 'go-sent')
      dispatch({ type: 'SET_VIEW', payload: 'mail' })
    else if (id === 'go-contacts')
      dispatch({ type: 'SET_VIEW', payload: 'contacts' })
    else if (id === 'go-calendar')
      dispatch({ type: 'SET_VIEW', payload: 'calendar' })
    else if (id === 'go-settings')
      dispatch({ type: 'SET_VIEW', payload: 'settings' })
    else if (id === 'go-starred')
      dispatch({ type: 'SET_VIEW', payload: 'mail' })
    else if (id === 'theme')
      dispatch({ type: 'UPDATE_SETTINGS', payload: { theme: currentTheme === 'dark' ? 'light' : 'dark' } })
    else if (id === 'density')
      dispatch({ type: 'UPDATE_SETTINGS', payload: { displayDensity: currentDensity === 'compact' ? 'comfortable' : 'compact' } })
  }

  function run(item) {
    onClose()
    if (item.type === 'message') {
      const msg = item.data
      dispatch({ type: 'SET_VIEW', payload: 'mail' })
      if (msg.folder) dispatch({ type: 'SELECT_FOLDER', payload: msg.folder })
      dispatch({ type: 'SELECT_MESSAGE', payload: msg })
    } else if (item.type === 'contact') {
      dispatch({ type: 'SET_VIEW', payload: 'contacts' })
      dispatch({ type: 'SELECT_CONTACT', payload: item.data })
    } else if (item.type === 'event') {
      dispatch({ type: 'SET_VIEW', payload: 'calendar' })
    } else {
      runCommand(item.data.id)
    }
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(allItems.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (allItems[idx]) run(allItems[idx]) }
    else if (e.key === 'Escape') { onClose() }
  }

  // Section rendering helpers
  function renderMessage(msg, i, globalIdx) {
    const active = globalIdx === idx
    const from = msg.from_name || msg.from_email || '?'
    const date = msg.date ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(msg.date)) : ''
    return (
      <div
        key={`msg-${msg.uid}-${msg.folder}`}
        className={`cmdk__item${active ? ' active' : ''}`}
        onMouseEnter={() => setIdx(globalIdx)}
        onClick={() => run({ type: 'message', data: msg })}
      >
        <span className="cmdk__item-ic"><IconMail size={16} /></span>
        <span className="cmdk__item-label">
          <span className="cmdk__res-primary">{msg.subject || t('reading.noSubject')}</span>
          <span className="cmdk__res-secondary">{from}</span>
        </span>
        {date && <span className="cmdk__res-date">{date}</span>}
      </div>
    )
  }

  function renderContact(ctc, globalIdx) {
    const active = globalIdx === idx
    return (
      <div
        key={`ctc-${ctc.id}`}
        className={`cmdk__item${active ? ' active' : ''}`}
        onMouseEnter={() => setIdx(globalIdx)}
        onClick={() => run({ type: 'contact', data: ctc })}
      >
        <span className="cmdk__item-ic"><IconContacts size={16} /></span>
        <span className="cmdk__item-label">
          <span className="cmdk__res-primary">{ctc.display_name || ctc.email}</span>
          {ctc.email && ctc.display_name && <span className="cmdk__res-secondary">{ctc.email}</span>}
        </span>
      </div>
    )
  }

  function renderEvent(ev, globalIdx) {
    const active = globalIdx === idx
    const date = ev.start_ts
      ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(ev.start_ts))
      : ''
    return (
      <div
        key={`ev-${ev.id}`}
        className={`cmdk__item${active ? ' active' : ''}`}
        onMouseEnter={() => setIdx(globalIdx)}
        onClick={() => run({ type: 'event', data: ev })}
      >
        <span className="cmdk__item-ic"><IconCalendar size={16} /></span>
        <span className="cmdk__item-label">
          <span className="cmdk__res-primary">{ev.title}</span>
          {ev.calendar_id && <span className="cmdk__res-secondary">{ev.calendar_id}</span>}
        </span>
        {date && <span className="cmdk__res-date">{date}</span>}
      </div>
    )
  }

  const noResults = isSearchMode && !searching &&
    results.messages.length === 0 && results.contacts.length === 0 &&
    results.events.length === 0 && filteredCmds.length === 0

  let globalIdx = 0
  let lastGroup = ''

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <div className="cmdk__search">
          <IconSearch size={19} />
          <input
            ref={inputRef}
            placeholder={t('cmdk.placeholder')}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
          />
          {searching && <div className="spinner" style={{ width: 14, height: 14, flexShrink: 0 }} />}
        </div>

        <div className="cmdk__list scroll">
          {noResults ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
              {t('cmdk.noResults')}
            </div>
          ) : (
            <>
              {/* ── Live search results ── */}
              {isSearchMode && results.messages.length > 0 && (
                <>
                  <div className="cmdk__group">{t('nav.mail')}</div>
                  {results.messages.map((m, i) => {
                    const gi = globalIdx++
                    return renderMessage(m, i, gi)
                  })}
                </>
              )}
              {isSearchMode && results.contacts.length > 0 && (
                <>
                  <div className="cmdk__group">{t('nav.contacts')}</div>
                  {results.contacts.map((c) => {
                    const gi = globalIdx++
                    return renderContact(c, gi)
                  })}
                </>
              )}
              {isSearchMode && results.events.length > 0 && (
                <>
                  <div className="cmdk__group">{t('nav.calendar')}</div>
                  {results.events.map((e) => {
                    const gi = globalIdx++
                    return renderEvent(e, gi)
                  })}
                </>
              )}

              {/* ── Commands ── */}
              {filteredCmds.length > 0 && (isSearchMode
                ? (results.messages.length + results.contacts.length + results.events.length > 0
                    ? <div className="cmdk__group">{t('cmdk.group.actions')}</div>
                    : null)
                : null
              )}
              {filteredCmds.map(c => {
                const gi = globalIdx++
                const active = gi === idx
                const showGroup = !isSearchMode && c.group !== lastGroup
                if (!isSearchMode) lastGroup = c.group
                const Ic = ICON_MAP[c.icon] || IconChevronRight
                return (
                  <React.Fragment key={c.id}>
                    {showGroup && <div className="cmdk__group">{c.group}</div>}
                    <div
                      className={`cmdk__item${active ? ' active' : ''}`}
                      onMouseEnter={() => setIdx(gi)}
                      onClick={() => run({ type: 'command', data: c })}
                    >
                      <span className="cmdk__item-ic"><Ic size={17} /></span>
                      <span className="cmdk__item-label">{c.label}</span>
                      {c.kbd && <kbd>{c.kbd}</kbd>}
                    </div>
                  </React.Fragment>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
