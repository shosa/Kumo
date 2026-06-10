import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppState } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import { IconAttach, IconCalendar, IconContacts, IconMail, IconSearch } from './Icons'

const EMPTY_RESULTS = { messages: [], attachments: [], contacts: [], events: [] }

export default function GlobalSearchPanel() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const locale = state.settings.language || 'en-US'
  const inputRef = useRef(null)
  const timerRef = useRef(null)
  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState('all')
  const [results, setResults] = useState(EMPTY_RESULTS)
  const [searching, setSearching] = useState(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (query.trim().length < 2) {
      setResults(EMPTY_RESULTS)
      setSearching(false)
      return undefined
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      const result = await window.api.search.global(query, state.auth.email, 12).catch(() => ({ ok: false }))
      if (result.ok) setResults(result.results)
      setSearching(false)
    }, 180)
    return () => clearTimeout(timerRef.current)
  }, [query, state.auth.email])

  const groups = useMemo(() => [
    { id: 'messages', label: t('nav.mail'), Icon: IconMail, items: results.messages },
    { id: 'attachments', label: t('search.attachments'), Icon: IconAttach, items: results.attachments },
    { id: 'contacts', label: t('nav.contacts'), Icon: IconContacts, items: results.contacts },
    { id: 'events', label: t('nav.calendar'), Icon: IconCalendar, items: results.events }
  ], [results, t])

  const visibleGroups = activeType === 'all' ? groups : groups.filter(group => group.id === activeType)
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  function openResult(type, item) {
    if (type === 'messages' || type === 'attachments') {
      dispatch({ type: 'SELECT_FOLDER', payload: item.folder })
      dispatch({ type: 'SELECT_MESSAGE', payload: item })
      dispatch({ type: 'SET_VIEW', payload: 'mail' })
    } else if (type === 'contacts') {
      dispatch({ type: 'SELECT_CONTACT', payload: item })
      dispatch({ type: 'SET_VIEW', payload: 'contacts' })
    } else {
      dispatch({ type: 'SELECT_CALENDAR_EVENT', payload: item })
      dispatch({ type: 'SET_VIEW', payload: 'calendar' })
    }
  }

  function secondaryText(type, item) {
    if (type === 'messages') return `${item.from_name || item.from_email || ''}${item.folder ? ` · ${item.folder}` : ''}`
    if (type === 'attachments') return item.subject || t('reading.noSubject')
    if (type === 'contacts') return item.email || item.organization || ''
    return item.location || item.calendar_id || ''
  }

  function primaryText(type, item) {
    if (type === 'messages') return item.subject || t('reading.noSubject')
    if (type === 'attachments') return item.filename
    if (type === 'contacts') return item.display_name || item.email
    return item.title
  }

  function resultDate(type, item) {
    const timestamp = type === 'events' ? item.start_ts : item.date
    if (!timestamp) return ''
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(timestamp))
  }

  return (
    <div className="global-search">
      <div className="global-search__box">
        <IconSearch size={22} />
        <input
          ref={inputRef}
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('search.globalPlaceholder')}
        />
        {searching && <span className="spinner global-search__spinner" />}
      </div>

      <div className="global-search__chips">
        <button className={activeType === 'all' ? 'active' : ''} onClick={() => setActiveType('all')}>
          {t('search.all')} {total || ''}
        </button>
        {groups.map(group => (
          <button key={group.id} className={activeType === group.id ? 'active' : ''} onClick={() => setActiveType(group.id)}>
            {group.label} {group.items.length || ''}
          </button>
        ))}
      </div>

      {query.trim().length < 2 ? (
        <div className="global-search__empty">
          <IconSearch size={42} />
          <strong>{t('search.globalTitle')}</strong>
          <span>{t('search.globalHint')}</span>
        </div>
      ) : total === 0 && !searching ? (
        <div className="global-search__empty"><span>{t('cmdk.noResults')}</span></div>
      ) : (
        <div className={`global-search__grid${activeType !== 'all' ? ' global-search__grid--single' : ''}`}>
          {visibleGroups.filter(group => group.items.length > 0).map(group => (
            <section className="global-search__group" key={group.id}>
              <h3>{group.label}</h3>
              {group.items.map((item, index) => (
                <button
                  key={item.id || `${item.folder}-${item.uid}-${index}`}
                  className="global-search__result"
                  onClick={() => openResult(group.id, item)}
                >
                  <span className="global-search__icon"><group.Icon size={17} /></span>
                  <span className="global-search__copy">
                    <strong>{primaryText(group.id, item)}</strong>
                    <small>{secondaryText(group.id, item)}</small>
                  </span>
                  <time>{resultDate(group.id, item)}</time>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
      <div className="global-search__footer">{t('search.globalFooter')}</div>
    </div>
  )
}
