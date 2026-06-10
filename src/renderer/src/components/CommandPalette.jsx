import React, { useEffect, useRef, useState } from 'react'
import { useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import {
  IconEdit, IconReply, IconSearch, IconInbox, IconStar,
  IconSent, IconContacts, IconCalendar, IconSettings, IconChevronRight
} from './Icons'

const ICON_MAP = {
  Edit: IconEdit,
  Reply: IconReply,
  Search: IconSearch,
  Inbox: IconInbox,
  Star: IconStar,
  Sent: IconSent,
  Contacts: IconContacts,
  Calendar: IconCalendar,
  Settings: IconSettings
}

export default function CommandPalette({ onClose, selectedMessage, currentTheme, currentDensity }) {
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)

  const commands = [
    { id: 'compose', group: t('cmdk.group.actions'), label: t('sidebar.compose'), icon: 'Edit', kbd: 'C' },
    { id: 'reply', group: t('cmdk.group.actions'), label: t('cmdk.cmd.reply'), icon: 'Reply', kbd: 'R' },
    { id: 'search', group: t('cmdk.group.actions'), label: t('cmdk.cmd.search'), icon: 'Search' },
    { id: 'go-inbox', group: t('cmdk.group.navigate'), label: t('folder.inbox'), icon: 'Inbox', kbd: 'G I' },
    { id: 'go-starred', group: t('cmdk.group.navigate'), label: t('cmdk.cmd.goStarred'), icon: 'Star' },
    { id: 'go-sent', group: t('cmdk.group.navigate'), label: t('folder.sent'), icon: 'Sent' },
    { id: 'go-contacts', group: t('cmdk.group.navigate'), label: t('nav.contacts'), icon: 'Contacts' },
    { id: 'go-calendar', group: t('cmdk.group.navigate'), label: t('nav.calendar'), icon: 'Calendar' },
    { id: 'go-settings', group: t('cmdk.group.navigate'), label: t('sidebar.settings'), icon: 'Settings' },
    { id: 'theme', group: t('cmdk.group.preferences'), label: t('cmdk.cmd.toggleTheme'), icon: 'Settings' },
    { id: 'density', group: t('cmdk.group.preferences'), label: t('cmdk.cmd.toggleDensity'), icon: 'Settings' }
  ]
  const filteredCommands = query
    ? commands.filter(command => command.label.toLowerCase().includes(query.toLowerCase()))
    : commands

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSelectedIndex(0) }, [query])

  function execute(id) {
    onClose()
    if (id === 'compose') window.api.window.openCompose({ mode: 'new' })
    else if (id === 'reply' && selectedMessage) window.api.window.openCompose({ mode: 'reply', message: selectedMessage })
    else if (id === 'search') dispatch({ type: 'SET_VIEW', payload: 'search' })
    else if (id === 'go-inbox' || id === 'go-sent' || id === 'go-starred') dispatch({ type: 'SET_VIEW', payload: 'mail' })
    else if (id === 'go-contacts') dispatch({ type: 'SET_VIEW', payload: 'contacts' })
    else if (id === 'go-calendar') dispatch({ type: 'SET_VIEW', payload: 'calendar' })
    else if (id === 'go-settings') dispatch({ type: 'SET_VIEW', payload: 'settings' })
    else if (id === 'theme') dispatch({ type: 'UPDATE_SETTINGS', payload: { theme: currentTheme === 'dark' ? 'light' : 'dark' } })
    else if (id === 'density') dispatch({ type: 'UPDATE_SETTINGS', payload: { displayDensity: currentDensity === 'compact' ? 'comfortable' : 'compact' } })
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex(index => Math.min(filteredCommands.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex(index => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (filteredCommands[selectedIndex]) execute(filteredCommands[selectedIndex].id)
    } else if (event.key === 'Escape') {
      onClose()
    }
  }

  let lastGroup = ''
  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={event => event.stopPropagation()}>
        <div className="cmdk__search">
          <IconSearch size={19} />
          <input
            ref={inputRef}
            placeholder={t('cmdk.placeholder')}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="cmdk__list scroll">
          {filteredCommands.length === 0 ? (
            <div className="cmdk__empty">{t('cmdk.noResults')}</div>
          ) : filteredCommands.map((command, index) => {
            const showGroup = command.group !== lastGroup
            lastGroup = command.group
            const Icon = ICON_MAP[command.icon] || IconChevronRight
            return (
              <React.Fragment key={command.id}>
                {showGroup && <div className="cmdk__group">{command.group}</div>}
                <div
                  className={`cmdk__item${selectedIndex === index ? ' active' : ''}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => execute(command.id)}
                >
                  <span className="cmdk__item-ic"><Icon size={17} /></span>
                  <span className="cmdk__item-label">{command.label}</span>
                  {command.kbd && <kbd>{command.kbd}</kbd>}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}
