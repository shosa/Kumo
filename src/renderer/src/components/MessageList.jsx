import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import { IconSearch, IconClose, IconAttach, IconEnvelope, IconStar, IconReply, IconTrash, IconMarkRead, IconRefresh, IconArrowDown } from './Icons'
import ContextMenu from './ContextMenu'
import { animateMessageRemoval } from '../motion'
import SenderAvatar, { getInitials, isOutgoingFolder } from './SenderAvatar'

function formatDate(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const sameYear = date.getFullYear() === now.getFullYear()
  const diffDays = Math.floor((now - date) / 86400000)

  if (isToday)     return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' })
  if (sameYear)    return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

const FOLDER_LABEL_KEY = {
  '\\Inbox':   'folder.inbox',
  '\\Sent':    'folder.sent',
  '\\Drafts':  'folder.drafts',
  '\\Trash':   'folder.trash',
  '\\Junk':    'folder.junk',
  '\\Archive': 'folder.archive'
}

function msgKey(msg) { return `${msg.folder}-${msg.uid}` }

const getSortLabels = (t) => ({ 'date-desc': t('sort.newest') + ' ↓', 'date-asc': t('sort.oldest') + ' ↑', from: t('sort.from') })

export default function MessageList() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const listRef = useRef(null)
  const searchInputRef = useRef(null)
  const lastAutoSyncFolder = useRef(null)
  const [localSearch, setLocalSearch] = useState('')
  const searchDebounce = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [activeFilter, setActiveFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date-desc')
  const [expandedThreads, setExpandedThreads] = useState(new Set())
  const [isSyncing, setIsSyncing] = useState(false)
  const [arrivalPulse, setArrivalPulse] = useState(false)
  const [mailRules, setMailRules] = useState([])
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false)
  const [advancedCriteria, setAdvancedCriteria] = useState({
    from: '', to: '', subject: '', dateFrom: '', dateTo: '',
    unread: false, starred: false, hasAttachments: false
  })

  const folder = state.folders.selected

  const contactMap = useMemo(() => {
    const map = new Map()
    for (const c of (state.contacts.list || [])) {
      if (!c.display_name) continue
      const add = (e) => { if (e && typeof e === 'string') map.set(e.toLowerCase(), c.display_name) }
      add(c.email)
      if (Array.isArray(c.emails)) c.emails.forEach(add)
    }
    return map
  }, [state.contacts.list])

  const loadMessages = useCallback(async (page = 1, showLoading = page > 1) => {
    if (!folder) return
    if (showLoading) dispatch({ type: 'SET_MESSAGES_LOADING', payload: true })
    const result = await window.api.imap.fetchMessages(folder, page, 50)
    if (result.ok) dispatch({ type: 'SET_MESSAGES', payload: { ...result, page } })
    else dispatch({ type: 'SET_MESSAGES_LOADING', payload: false })
  }, [folder, dispatch])

  async function handleSync() {
    if (isSyncing || !folder) return
    setIsSyncing(true)
    try {
      if (!folder.startsWith('smart:')) await window.api.imap.syncFolder(folder)
      await loadMessages(1, false)
    } catch { /* ignore */ }
    setIsSyncing(false)
  }

  function cycleSortBy() {
    setSortBy(s => s === 'date-desc' ? 'date-asc' : s === 'date-asc' ? 'from' : 'date-desc')
  }

  useEffect(() => { if (folder) loadMessages(1, false) }, [folder, loadMessages])
  useEffect(() => {
    window.api.rules.list().then(result => {
      if (result.ok) setMailRules(result.rules || [])
    })
  }, [state.settings.rulesVersion])
  useEffect(() => { if (state.messages._newMailSignal) loadMessages(1, false) }, [state.messages._newMailSignal, loadMessages])
  useEffect(() => { if (state.messages._syncSignal) loadMessages(1, false) }, [state.messages._syncSignal, loadMessages])
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0 }, [folder])

  useEffect(() => {
    if (!folder || folder.startsWith('smart:') || state.connectionStatus !== 'connected') return
    if (lastAutoSyncFolder.current === folder) return
    lastAutoSyncFolder.current = folder

    if (state.messages._lastSyncedFolder === folder) return

    setIsSyncing(true)
    window.api.imap.syncFolder(folder)
      .then(() => {
        if (lastAutoSyncFolder.current === folder) return loadMessages(1, false)
      })
      .catch(() => {})
      .finally(() => {
        if (lastAutoSyncFolder.current === folder) setIsSyncing(false)
      })
  }, [folder, state.connectionStatus, loadMessages])

  // Clear multi-selection and reset filters when folder changes
  useEffect(() => { setSelectedKeys(new Set()); setActiveFilter('all'); setSortBy('date-desc') }, [folder])

  // Auto-select message when opened from a notification click
  useEffect(() => {
    const uid = state.messages.pendingNotifUid
    if (!uid || !state.messages.list.length) return
    const target = state.messages.list.find(m => m.uid === uid && m.folder === folder)
    if (target) {
      selectSingle(target)
      dispatch({ type: 'CLEAR_NOTIF_TARGET' })
    }
  }, [state.messages.list, state.messages.pendingNotifUid, folder])

  // Ctrl+A selects all visible messages
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        setSelectedKeys(new Set(displayMessages.map(msgKey)))
      }
      if (e.key === 'Escape') setSelectedKeys(new Set())
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [state.messages.list, state.messages.searchResults, activeFilter, sortBy])

  function handleLoadMore() {
    if (!state.messages.hasMore || state.messages.loading) return
    loadMessages(state.messages.page + 1)
  }
  function handleScroll(e) {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    if (scrollHeight - scrollTop - clientHeight < 100) handleLoadMore()
  }

  function selectSingle(msg) {
    setSelectedKeys(new Set())
    dispatch({ type: 'SELECT_MESSAGE', payload: msg })
    if (!msg.flags?.includes('\\Seen') && msg.folder) {
      window.api.imap.markRead(msg.folder, msg.uid, true, state.auth.email)
      dispatch({
        type: 'UPDATE_MESSAGE_FLAGS',
        payload: { uid: msg.uid, folder: msg.folder, flags: [...(msg.flags || []), '\\Seen'] }
      })
    }
  }

  function handleItemClick(e, msg) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const k = msgKey(msg)
      setSelectedKeys(prev => {
        const next = new Set(prev)
        next.has(k) ? next.delete(k) : next.add(k)
        return next
      })
    } else {
      selectSingle(msg)
    }
  }

  function handleItemContextMenu(e, msg) {
    e.preventDefault()
    const k = msgKey(msg)
    const isInSelection = selectedKeys.has(k) && selectedKeys.size > 1
    const targetMessages = isInSelection
      ? displayMessages.filter(m => selectedKeys.has(msgKey(m)))
      : [msg]
    setContextMenu({ x: e.clientX, y: e.clientY, messages: targetMessages })
  }

  function handleSearchChange(q) {
    setLocalSearch(q)
    clearTimeout(searchDebounce.current)

    if (!q.trim()) {
      dispatch({ type: 'CLEAR_SEARCH' })
      return
    }
    dispatch({ type: 'SET_SEARCH_QUERY', payload: q })

    // Show local FTS5 results immediately
    window.api.store.searchLocal(q).then(lr => {
      if (lr.ok && state.messages.searchQuery === q) {
        dispatch({ type: 'SET_SEARCH_RESULTS', payload: lr.results })
      }
    })

    // IMAP server search after 600ms debounce
    const currentFolder = state.folders.selected
    searchDebounce.current = setTimeout(async () => {
      if (currentFolder.startsWith('smart:')) return
      const sr = await window.api.imap.search(currentFolder, q)
      if (sr.ok && sr.results?.length) {
        const lr2 = await window.api.store.searchLocal(q)
        const local = lr2.ok ? (lr2.results || []) : []
        const combined = [
          ...local,
          ...sr.results.filter(s => !local.some(l => l.uid === s.uid && l.folder === s.folder))
        ]
        dispatch({ type: 'SET_SEARCH_RESULTS', payload: combined })
      }
    }, 600)
  }

  function clearSearch() {
    setLocalSearch('')
    setAdvancedCriteria({
      from: '', to: '', subject: '', dateFrom: '', dateTo: '',
      unread: false, starred: false, hasAttachments: false
    })
    dispatch({ type: 'CLEAR_SEARCH' })
  }

  async function runAdvancedSearch() {
    const criteria = { text: localSearch, ...advancedCriteria }
    const hasCriteria = Object.values(criteria).some(value => value === true || String(value || '').trim())
    if (!hasCriteria) {
      dispatch({ type: 'CLEAR_SEARCH' })
      return
    }
    dispatch({ type: 'SET_SEARCH_QUERY', payload: localSearch || t('search.advanced') })
    const result = await window.api.store.searchLocal(criteria)
    if (result.ok) dispatch({ type: 'SET_SEARCH_RESULTS', payload: result.results || [] })
  }

  function handleContextAction(type, messages, data) {
    const folder0 = messages[0].folder
    const uids = messages.map(m => m.uid)
    const msg = messages[0]
    if (!folder0 && ['markRead','markUnread','star','unstar','move','junk','delete'].includes(type)) return

    switch (type) {
      case 'reply':
        window.api.window.openCompose({ mode: 'reply', message: msg })
        break
      case 'replyAll':
        window.api.window.openCompose({ mode: 'replyAll', message: msg })
        break
      case 'forward':
        window.api.window.openCompose({ mode: 'forward', message: msg })
        break

      case 'markRead':
        messages.forEach(m => dispatch({ type: 'UPDATE_MESSAGE_FLAGS', payload: { uid: m.uid, folder: m.folder, flags: [...(m.flags || []), '\\Seen'] } }))
        window.api.imap.bulkSetFlag(folder0, uids, '\\Seen', true, state.auth.email)
        break
      case 'markUnread':
        messages.forEach(m => dispatch({ type: 'UPDATE_MESSAGE_FLAGS', payload: { uid: m.uid, folder: m.folder, flags: (m.flags || []).filter(f => f !== '\\Seen') } }))
        window.api.imap.bulkSetFlag(folder0, uids, '\\Seen', false, state.auth.email)
        break
      case 'star':
        messages.forEach(m => dispatch({ type: 'UPDATE_MESSAGE_FLAGS', payload: { uid: m.uid, folder: m.folder, flags: [...(m.flags || []), '\\Flagged'] } }))
        window.api.imap.bulkSetFlag(folder0, uids, '\\Flagged', true, state.auth.email)
        break
      case 'unstar':
        messages.forEach(m => dispatch({ type: 'UPDATE_MESSAGE_FLAGS', payload: { uid: m.uid, folder: m.folder, flags: (m.flags || []).filter(f => f !== '\\Flagged') } }))
        window.api.imap.bulkSetFlag(folder0, uids, '\\Flagged', false, state.auth.email)
        break
      case 'move':
        animateMessageRemoval(dispatch, messages)
        setSelectedKeys(new Set())
        window.api.imap.bulkMove(folder0, uids, data, state.auth.email)
        break
      case 'junk':
        animateMessageRemoval(dispatch, messages)
        setSelectedKeys(new Set())
        Promise.all(messages.map(m => window.api.imap.markJunk(m.folder, m.uid, true, state.auth.email)))
        break
      case 'delete':
        animateMessageRemoval(dispatch, messages)
        setSelectedKeys(new Set())
        window.api.imap.bulkDelete(folder0, uids, state.auth.email)
        break
    }
  }

  const folderObj = state.folders.list.find(f => f.path === folder)
  const smartNames = {
    'smart:unread': t('smart.unread'),
    'smart:starred': t('smart.starred'),
    'smart:attachments': t('smart.attachments'),
    'smart:reply': t('smart.reply')
  }
  for (const rule of mailRules) smartNames[`smart:rule-${rule.id}`] = rule.name
  const folderDisplayName = smartNames[folder] || (folderObj
    ? (folderObj.special_use && FOLDER_LABEL_KEY[folderObj.special_use]
        ? t(FOLDER_LABEL_KEY[folderObj.special_use])
        : (folderObj.name || folder?.split('/').pop() || folder || ''))
    : (folder?.split('/').pop() || folder || ''))

  const rawMessages = state.messages.searchResults !== null
    ? state.messages.searchResults : state.messages.list

  const filteredMessages = activeFilter === 'unread'
    ? rawMessages.filter(m => !m.flags?.includes('\\Seen'))
    : activeFilter === 'starred'
      ? rawMessages.filter(m => m.flags?.includes('\\Flagged'))
      : rawMessages

  const displayMessages = [...filteredMessages].sort((a, b) => {
    if (sortBy === 'date-asc') return (a.date || 0) - (b.date || 0)
    if (sortBy === 'from')    return (a.from_name || a.from_email || '').localeCompare(b.from_name || b.from_email || '')
    if (sortBy === 'subject') return (a.subject || '').localeCompare(b.subject || '')
    return (b.date || 0) - (a.date || 0)
  })
  const hasIncomingMail = displayMessages.some(message =>
    msgKey(message) === state.messages.newMailKey
  )

  useEffect(() => {
    if (!hasIncomingMail) return undefined

    setArrivalPulse(false)
    let secondFrame
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setArrivalPulse(true))
    })
    const timer = setTimeout(() => setArrivalPulse(false), 720)

    return () => {
      cancelAnimationFrame(firstFrame)
      if (secondFrame) cancelAnimationFrame(secondFrame)
      clearTimeout(timer)
    }
  }, [hasIncomingMail, state.messages.newMailKey])

  const primaryUid = state.messages.selected?.uid

  function groupByThread(messages, sort) {
    const threadMap = new Map()
    for (const msg of messages) {
      const tid = msg.thread_id || `single-${msg.uid}-${msg.folder}`
      if (!threadMap.has(tid)) threadMap.set(tid, [])
      threadMap.get(tid).push(msg)
    }
    for (const msgs of threadMap.values()) {
      msgs.sort((a, b) => (a.date || 0) - (b.date || 0))
    }
    const threads = [...threadMap.entries()].map(([threadId, msgs]) => ({
      threadId,
      messages: msgs,
      latest: msgs.reduce((a, b) => (b.date || 0) > (a.date || 0) ? b : a)
    }))
    threads.sort((a, b) => {
      if (sort === 'date-asc') return (a.latest.date || 0) - (b.latest.date || 0)
      if (sort === 'from')    return (a.latest.from_name || a.latest.from_email || '').localeCompare(b.latest.from_name || b.latest.from_email || '')
      if (sort === 'subject') return (a.latest.subject || '').localeCompare(b.latest.subject || '')
      return (b.latest.date || 0) - (a.latest.date || 0)
    })
    return threads
  }

  return (
    <div className={`list${arrivalPulse ? ' list--new-mail' : ''}`} onClick={e => { if (!e.defaultPrevented) setContextMenu(null) }}>

      <div className="list__head">
        <div className="list__titlerow">
          <span className="list__title">
            {state.messages.searchResults !== null ? `"${localSearch}"` : folderDisplayName}
          </span>
          <span className="list__count">
            {state.messages.searchResults !== null
              ? displayMessages.length
              : (state.messages.total || displayMessages.length)}
          </span>
          {selectedKeys.size > 1 && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)', fontWeight: 'var(--weight-medium)', marginLeft: 'var(--sp-2)' }}>
              · {t('multiselect.count', selectedKeys.size)}
            </span>
          )}
          <div className="list__head-actions">
            <button className="icon-btn" onClick={handleSync} title={t('folder.refresh')}>
              <IconRefresh size={16} className={isSyncing ? 'spin' : ''} />
            </button>
          </div>
        </div>
        <div className="search">
          <span className="search__icon"><IconSearch size={15} /></span>
          <input
            ref={searchInputRef}
            placeholder={t('messages.searchInbox')}
            value={localSearch}
            onChange={e => handleSearchChange(e.target.value)}
          />
          {localSearch
            ? <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => handleSearchChange('')}>
                <IconClose size={13} />
              </button>
            : <kbd>Ctrl+K</kbd>
          }
        </div>
        <button
          className={`advanced-search-toggle${advancedSearchOpen ? ' active' : ''}`}
          type="button"
          onClick={() => setAdvancedSearchOpen(value => !value)}
        >
          {t('search.advanced')}
        </button>
        {advancedSearchOpen && (
          <div className="advanced-search">
            <label><span>{t('search.from')}</span><input value={advancedCriteria.from} onChange={e => setAdvancedCriteria(c => ({ ...c, from: e.target.value }))} /></label>
            <label><span>{t('search.to')}</span><input value={advancedCriteria.to} onChange={e => setAdvancedCriteria(c => ({ ...c, to: e.target.value }))} /></label>
            <label className="advanced-search__wide"><span>{t('search.subject')}</span><input value={advancedCriteria.subject} onChange={e => setAdvancedCriteria(c => ({ ...c, subject: e.target.value }))} /></label>
            <label><span>{t('search.fromDate')}</span><input type="date" value={advancedCriteria.dateFrom} onChange={e => setAdvancedCriteria(c => ({ ...c, dateFrom: e.target.value }))} /></label>
            <label><span>{t('search.toDate')}</span><input type="date" value={advancedCriteria.dateTo} onChange={e => setAdvancedCriteria(c => ({ ...c, dateTo: e.target.value }))} /></label>
            <div className="advanced-search__checks advanced-search__wide">
              {[
                ['unread', t('filter.unread')],
                ['starred', t('filter.starred')],
                ['hasAttachments', t('search.hasAttachments')]
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={advancedCriteria[key]}
                    onChange={e => setAdvancedCriteria(c => ({ ...c, [key]: e.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
              <button className="act act--primary" type="button" onClick={runAdvancedSearch}>{t('search.apply')}</button>
            </div>
          </div>
        )}
      </div>

      <div className="list__filters">
        <div className="seg">
          {[['all', t('filter.all')], ['unread', t('filter.unread')], ['starred', t('filter.starred')]].map(([f, l]) => (
            <button
              key={f}
              className={`seg__btn${activeFilter === f ? ' active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >{l}</button>
          ))}
        </div>
        <button className="sortbtn" onClick={cycleSortBy}>
          {getSortLabels(t)[sortBy]} <IconArrowDown size={13} />
        </button>
      </div>

      {state.messages.loading && displayMessages.length === 0 ? (
        <div className="list__body" style={{ pointerEvents: 'none' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="mail mail--skeleton">
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton" style={{ width: '60%', height: 12 }} />
                <div className="skeleton" style={{ width: '85%', height: 11 }} />
                <div className="skeleton" style={{ width: '45%', height: 10 }} />
              </div>
            </div>
          ))}
        </div>
      ) : displayMessages.length === 0 ? (
        <div className="list__empty">
          <div style={{ opacity: 0.2 }}><IconEnvelope size={44} /></div>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)' }}>
            {localSearch ? t('messages.noResults') : t('messages.noMessages')}
          </span>
          {localSearch && (
            <button
              className="btn btn--ghost"
              onClick={clearSearch}
              style={{ marginTop: 'var(--sp-2)' }}
            >
              {t('action.clearSearch')}
            </button>
          )}
        </div>
      ) : (
        <div className="list__body scroll" ref={listRef} onScroll={handleScroll} role="list" aria-label="Messages">
          {groupByThread(displayMessages, sortBy).map(({ threadId, messages: threadMsgs, latest }) => {
            const isExpanded = expandedThreads.has(threadId)
            const isMulti    = threadMsgs.length > 1
            const msgsToShow = isExpanded ? threadMsgs : [latest]

            return (
              <React.Fragment key={threadId}>
                {msgsToShow.map((msg, idx) => (
                  <MessageItem
                    key={`${msg.folder}-${msg.uid}`}
                    message={msg}
                    selected={primaryUid === msg.uid && selectedKeys.size === 0}
                    multiSelected={selectedKeys.has(msgKey(msg))}
                    exiting={state.messages.exitingKeys.includes(msgKey(msg))}
                    isNew={state.messages.newMailKey === msgKey(msg)}
                    threadCount={idx === 0 && isMulti ? threadMsgs.length : null}
                    isThreadChild={idx > 0}
                    contactMap={contactMap}
                    state={state}
                    t={t}
                    onQuickAction={(type) => handleContextAction(type, [msg])}
                    onThreadExpand={isMulti && idx === 0 ? () => setExpandedThreads(prev => {
                      const next = new Set(prev)
                      next.has(threadId) ? next.delete(threadId) : next.add(threadId)
                      return next
                    }) : null}
                    onClick={e => handleItemClick(e, msg)}
                    onDoubleClick={async () => {
                      if (msg.uid > 0 && msg.sync_status !== 'pending') {
                        const folder = state.folders.list.find(item => item.path === msg.folder)
                        if (folder?.special_use === '\\Drafts') {
                          const result = await window.api.drafts.openRemote(msg.folder, msg.uid, state.auth.email)
                          if (result.ok) {
                            window.api.window.openCompose({ mode: 'draft', draft: result.draft })
                          }
                          return
                        }
                        window.api.window.openMessage(msg)
                      }
                    }}
                    onContextMenu={e => handleItemContextMenu(e, msg)}
                    onDragStart={e => {
                      const isInSelection = selectedKeys.has(msgKey(msg)) && selectedKeys.size > 1
                      const toMove = isInSelection
                        ? displayMessages.filter(m => selectedKeys.has(msgKey(m)))
                        : [msg]
                      e.dataTransfer.setData('x-mail-messages', JSON.stringify(
                        toMove.map(m => ({ uid: m.uid, folder: m.folder }))
                      ))
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                  />
                ))}
              </React.Fragment>
            )
          })}

          {state.messages.hasMore && !state.messages.searchResults && (
            <div className="list__load-more">
              {state.messages.loading ? (
                <div className="spinner" style={{ margin: '0 auto' }} />
              ) : (
                <button className="btn btn--ghost" onClick={handleLoadMore}>
                  {t('action.loadMore')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          messages={contextMenu.messages}
          folders={state.folders.list}
          onClose={() => setContextMenu(null)}
          onAction={(type, data) => handleContextAction(type, contextMenu.messages, data)}
        />
      )}
    </div>
  )
}

function MessageItem({ message, selected, multiSelected, exiting, isNew, threadCount, isThreadChild, onThreadExpand, onClick, onDoubleClick, onContextMenu, onDragStart, onQuickAction, contactMap, state, t }) {
  const isUnread  = !message.flags?.includes('\\Seen')
  const isStarred = message.flags?.includes('\\Flagged')
  const hasAttachments = message.has_attachments || false
  const folder = state.folders.list.find(item => item.path === message.folder) || { path: message.folder }
  const isSentFolder = isOutgoingFolder(folder)
  const resolvedName = (() => {
    if (isSentFolder) {
      const to = message.to_addresses
      const arr = Array.isArray(to) ? to : (typeof to === 'string' ? (() => { try { return JSON.parse(to) } catch { return [] } })() : [])
      const first = arr[0]
      if (first) return (typeof first === 'object' ? (first.name || first.email) : String(first)) || '?'
    }
    return contactMap?.get(message.from_email?.toLowerCase()) || message.from_name || message.from_email || '?'
  })()
  const senderEmail = message.from_email || message.from || ''
  const initials  = getInitials(resolvedName, senderEmail)

  return (
    <div
      className={`mail${selected ? ' sel' : ''}${isUnread ? '' : ' read'}${multiSelected ? ' multi-selected' : ''}${isThreadChild ? ' thread-child' : ''}${exiting ? ' mail--exiting' : ''}${isNew ? ' mail--new' : ''}`}
      data-avatars={state.settings.showAvatars !== false ? 'on' : 'off'}
      data-preview={state.settings.showPreview !== false ? 'on' : 'off'}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      role="listitem"
      tabIndex={0}
      aria-selected={selected}
      aria-label={`${resolvedName}: ${message.subject}`}
      onKeyDown={e => e.key === 'Enter' && onClick(e)}
    >
      <span className="mail__unread" />

      <SenderAvatar
        className="mail__avatar"
        name={resolvedName}
        email={senderEmail}
        folder={folder}
        enabled={state.settings.showAvatars !== false && state.settings.showSenderLogos === true && !multiSelected}
        fallback={multiSelected ? '✓' : initials}
        style={multiSelected ? { background: 'var(--accent)' } : undefined}
      />

      <div className="mail__body">
        <div className="mail__r1">
          <span className="mail__from">
            {resolvedName}
          </span>
          {threadCount && (
            <span
              className="message-item__thread-count"
              onClick={e => { e.stopPropagation(); onThreadExpand?.() }}
            >{threadCount}</span>
          )}
          {isStarred && !multiSelected && (
            <span className="mail__star"><IconStar size={12} fill="currentColor" /></span>
          )}
          <span className="mail__time">{formatDate(message.date)}</span>
        </div>
        <div className="mail__subject">{message.subject || '(senza oggetto)'}</div>
        <div className="mail__preview">
          {hasAttachments && <IconAttach size={12} />}
          <span>{message.snippet || message.preview || ''}</span>
        </div>
      </div>

      {onQuickAction && (
        <div className="mail__qa" onClick={e => e.stopPropagation()}>
          <button
            className="qa-btn"
            title={t('action.reply')}
            onClick={e => { e.stopPropagation(); onQuickAction('reply') }}
          ><IconReply size={15} /></button>
          <button
            className={`qa-btn${isStarred ? ' on' : ''}`}
            title={isStarred ? t('action.unstar') : t('action.star')}
            onClick={e => { e.stopPropagation(); onQuickAction(isStarred ? 'unstar' : 'star') }}
          ><IconStar size={15} fill={isStarred ? 'currentColor' : 'none'} /></button>
          <button
            className="qa-btn"
            title={isUnread ? t('action.markRead') : t('action.markUnread')}
            onClick={e => { e.stopPropagation(); onQuickAction(isUnread ? 'markRead' : 'markUnread') }}
          ><IconMarkRead size={15} /></button>
          <button
            className="qa-btn qa-btn--danger"
            title={t('action.delete')}
            onClick={e => { e.stopPropagation(); onQuickAction('delete') }}
          ><IconTrash size={15} /></button>
        </div>
      )}
    </div>
  )
}
