import React, { useState, useRef, useEffect } from 'react'
import { useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import {
  IconEdit, IconReply, IconSearch, IconInbox, IconStar,
  IconSent, IconContacts, IconCalendar, IconSettings, IconChevronRight
} from './Icons'

const ICON_MAP = {
  Edit: IconEdit, Reply: IconReply, Search: IconSearch,
  Inbox: IconInbox, Star: IconStar, Sent: IconSent,
  Contacts: IconContacts, Calendar: IconCalendar, Settings: IconSettings
}

export default function CommandPalette({ onClose, selectedMessage, currentTheme, currentDensity }) {
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)

  const COMMANDS = [
    { id: 'compose',     group: t('cmdk.group.actions'),      label: t('sidebar.compose'),          icon: 'Edit',     kbd: 'C' },
    { id: 'reply',       group: t('cmdk.group.actions'),      label: t('cmdk.cmd.reply'),            icon: 'Reply',    kbd: 'R' },
    { id: 'search',      group: t('cmdk.group.actions'),      label: t('cmdk.cmd.search'),           icon: 'Search' },
    { id: 'go-inbox',    group: t('cmdk.group.navigate'),     label: t('folder.inbox'),              icon: 'Inbox',    kbd: 'G I' },
    { id: 'go-starred',  group: t('cmdk.group.navigate'),     label: t('cmdk.cmd.goStarred'),        icon: 'Star' },
    { id: 'go-sent',     group: t('cmdk.group.navigate'),     label: t('folder.sent'),               icon: 'Sent' },
    { id: 'go-contacts', group: t('cmdk.group.navigate'),     label: t('nav.contacts'),              icon: 'Contacts' },
    { id: 'go-calendar', group: t('cmdk.group.navigate'),     label: t('nav.calendar'),              icon: 'Calendar' },
    { id: 'go-settings', group: t('cmdk.group.navigate'),     label: t('sidebar.settings'),          icon: 'Settings' },
    { id: 'theme',       group: t('cmdk.group.preferences'),  label: t('cmdk.cmd.toggleTheme'),      icon: 'Settings' },
    { id: 'density',     group: t('cmdk.group.preferences'),  label: t('cmdk.cmd.toggleDensity'),    icon: 'Settings' }
  ]

  const filtered = COMMANDS.filter(c => c.label.toLowerCase().includes(q.toLowerCase()))

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setIdx(0) }, [q])

  function run(id) {
    onClose()
    if (id === 'compose')
      window.api.window.openCompose({ mode: 'new' })
    else if (id === 'reply' && selectedMessage)
      window.api.window.openCompose({ mode: 'reply', message: selectedMessage })
    else if (id === 'go-inbox')
      dispatch({ type: 'SET_VIEW', payload: 'mail' })
    else if (id === 'go-sent')
      dispatch({ type: 'SET_VIEW', payload: 'mail' })
    else if (id === 'go-contacts')
      dispatch({ type: 'SET_VIEW', payload: 'contacts' })
    else if (id === 'go-calendar')
      dispatch({ type: 'SET_VIEW', payload: 'calendar' })
    else if (id === 'go-settings')
      dispatch({ type: 'SET_VIEW', payload: 'settings' })
    else if (id === 'theme')
      dispatch({ type: 'UPDATE_SETTINGS', payload: { theme: currentTheme === 'dark' ? 'light' : 'dark' } })
    else if (id === 'density')
      dispatch({ type: 'UPDATE_SETTINGS', payload: { displayDensity: currentDensity === 'compact' ? 'comfortable' : 'compact' } })
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[idx]) run(filtered[idx].id) }
    else if (e.key === 'Escape') { onClose() }
  }

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
        </div>
        <div className="cmdk__list scroll">
          {filtered.length === 0
            ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>{t('cmdk.noResults')}</div>
            : filtered.map((c, i) => {
                const showGroup = c.group !== lastGroup; lastGroup = c.group
                const Ic = ICON_MAP[c.icon] || IconChevronRight
                return (
                  <React.Fragment key={c.id}>
                    {showGroup && <div className="cmdk__group">{c.group}</div>}
                    <div
                      className={`cmdk__item${i === idx ? ' active' : ''}`}
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => run(c.id)}
                    >
                      <span className="cmdk__item-ic"><Ic size={17} /></span>
                      <span className="cmdk__item-label">{c.label}</span>
                      {c.kbd && <kbd>{c.kbd}</kbd>}
                    </div>
                  </React.Fragment>
                )
              })
          }
        </div>
      </div>
    </div>
  )
}
