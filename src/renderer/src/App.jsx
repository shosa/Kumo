import React, { useEffect, useRef, useCallback, useState } from 'react'
import { useAppState, useAppDispatch } from './context/AppContext'
import SetupScreen from './components/SetupScreen'
import Rail from './components/Rail'
import Sidebar from './components/Sidebar'
import MessageList from './components/MessageList'
import ReadingPane from './components/ReadingPane'
import ContactsPanel from './components/ContactsPanel'
import CalendarPanel from './components/CalendarPanel'
import ComposeWindow from './components/ComposeWindow'
import Settings from './components/Settings'
import TitleBar from './components/TitleBar'
import UpdateBanner from './components/UpdateBanner'
import CommandPalette from './components/CommandPalette'
import ActivityCenter from './components/ActivityCenter'
import GlobalSearchPanel from './components/GlobalSearchPanel'
import UndoSendToast from './components/UndoSendToast'
import { useAppearance } from './appearance'
import { normalizeConnectionStatus } from './connectionStatus'
import { animateMessageRemoval } from './motion'

const MSGLIST_MIN = 220
const MSGLIST_MAX = 480

function loadWidths() {
  try {
    const ml = parseInt(localStorage.getItem('pane-msglist') || '', 10)
    return { msglist: (ml >= MSGLIST_MIN && ml <= MSGLIST_MAX) ? ml : 320 }
  } catch { return { msglist: 320 } }
}

function saveWidth(key, value) {
  try { localStorage.setItem(`pane-${key}`, String(value)) } catch { /* ignore */ }
  try { window.api.settings.save({ [`pane_${key}`]: value }) } catch { /* ignore */ }
}

function useResizeHandle(containerRef, key, min, max, onResize) {
  const dragging = useRef(false)
  const hasMoved  = useRef(false)
  const startX    = useRef(0)
  const startW    = useRef(0)
  const currentW  = useRef(0)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    hasMoved.current = false
    startX.current = e.clientX
    const w = containerRef.current
      ? containerRef.current.getBoundingClientRect().width
      : (min + max) / 2
    startW.current = w
    currentW.current = w
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [containerRef, min, max])

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragging.current) return
      const newW = Math.min(max, Math.max(min, startW.current + (e.clientX - startX.current)))
      currentW.current = newW
      hasMoved.current = true
      if (containerRef.current) containerRef.current.style.width = `${newW}px`
      onResize(newW)
    }
    function onMouseUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (hasMoved.current) {
        saveWidth(key, Math.round(currentW.current))
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [containerRef, key, min, max, onResize])

  return onMouseDown
}

export default function App() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const view = state.view || 'mail'
  const [cmdkOpen, setCmdkOpen] = useState(false)

  const widths = useRef(loadWidths())
  const msglistRef = useRef(null)

  // Hydrate msglist width from settings if localStorage was empty on startup
  useEffect(() => {
    if (state.settings.pane_msglist && !localStorage.getItem('pane-msglist')) {
      const w = state.settings.pane_msglist
      widths.current.msglist = w
      if (msglistRef.current) msglistRef.current.style.width = `${w}px`
    }
  }, [state.settings.pane_msglist])

  // Re-apply stored msglist width when switching back to mail view
  useEffect(() => {
    if (view !== 'mail') return
    if (msglistRef.current) msglistRef.current.style.width = `${widths.current.msglist}px`
  }, [view])

  const onMsglistResize = useCallback(w => { widths.current.msglist = w }, [])
  const onMsglistDrag = useResizeHandle(msglistRef, 'msglist', MSGLIST_MIN, MSGLIST_MAX, onMsglistResize)

  // Badge
  useEffect(() => {
    const total = state.folders.list.reduce((sum, f) => sum + (f.unread_count || 0), 0)
    window.api.window.setBadge(total)
  }, [state.folders.list])

  useAppearance(state.settings)

  // Density vars on :root
  useEffect(() => {
    const r = document.documentElement
    if (state.settings.displayDensity === 'comfortable') {
      r.style.setProperty('--row-pad-y', '11px')
      r.style.setProperty('--row-gap', '12px')
      r.style.setProperty('--list-fs', '14px')
    } else {
      r.style.setProperty('--row-pad-y', '7px')
      r.style.setProperty('--row-gap', '10px')
      r.style.setProperty('--list-fs', '13px')
    }
  }, [state.settings.displayDensity])

  // IPC listeners
  useEffect(() => {
    const offNewMail = window.api.on('imap:new-mail', data => dispatch({ type: 'NEW_MAIL', payload: data }))
    const offStatus  = window.api.on('imap:connection-status', payload => {
      const status = normalizeConnectionStatus(payload)
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: status })
      if (status === 'connecting' || status === 'reconnecting') {
        dispatch({ type: 'SET_LOADING', payload: status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…' })
      } else {
        dispatch({ type: 'CLEAR_LOADING' })
      }
    })
    const offCompose = window.api.on('open-compose', data => window.api.window.openCompose(data || { mode: 'new' }))
    const offSync    = window.api.on('imap:sync-complete', ({ folder, newCount, removedCount }) =>
      dispatch({ type: 'SYNC_COMPLETE', payload: { folder, newCount, removedCount } }))
    const offFlags   = window.api.on('imap:flags-updated', ({ folder, uid, flags }) =>
      dispatch({ type: 'UPDATE_MESSAGE_FLAGS', payload: { folder, uid, flags } }))
    const offNotif   = window.api.on('imap:notification-click', ({ folder, uid }) =>
      dispatch({ type: 'NOTIF_OPEN_MAIL', payload: { folder, uid } }))
    const offFoldersChanged = window.api.on('store:folders-changed', folders =>
      dispatch({ type: 'SET_FOLDERS', payload: folders }))
    const offRollback = window.api.on('sync:rollback', ({ folder, destination, uid, flags }) => {
      if (folder && uid && Array.isArray(flags)) {
        dispatch({ type: 'UPDATE_MESSAGE_FLAGS', payload: { folder, uid, flags } })
      } else if (folder || destination) {
        const selectedFolder = state.folders.selected
        if (selectedFolder === folder || selectedFolder === destination) {
          dispatch({ type: 'SYNC_COMPLETE', payload: { folder: selectedFolder, rolledBack: true } })
        }
        window.api.imap.getFolders().then(result => {
          if (result.ok) dispatch({ type: 'SET_FOLDERS', payload: result.folders })
        })
      }
    })
    return () => {
      offNewMail?.()
      offStatus?.()
      offCompose?.()
      offSync?.()
      offFlags?.()
      offNotif?.()
      offFoldersChanged?.()
      offRollback?.()
    }
  }, [dispatch, state.folders.selected])

  useEffect(() => {
    if (!state.messages.newMailKey) return undefined
    const timer = setTimeout(() => dispatch({ type: 'CLEAR_NEW_MAIL' }), 2400)
    return () => clearTimeout(timer)
  }, [state.messages.newMailKey, dispatch])

  // Keyboard shortcuts
  useEffect(() => {
    if (!state.auth.isAuthenticated) return
    function onKeyDown(e) {
if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setCmdkOpen(v => !v); return
      }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.target.contentEditable === 'true') return
      if (cmdkOpen) { if (e.key === 'Escape') setCmdkOpen(false); return }
      switch (e.key) {
        case 'c':
          window.api.window.openCompose({ mode: 'new' })
          break
        case 'r':
          if (state.messages.selected)
            window.api.window.openCompose({ mode: 'reply', message: state.messages.selected })
          break
        case 'e':
        case 'E':
          if (state.messages.selected && view === 'mail') {
            const msg = state.messages.selected
            if (msg.folder) {
              animateMessageRemoval(dispatch, [msg])
              window.api.imap.archiveMessage(msg.folder, msg.uid, state.auth.email)
            }
          }
          break
        case 'Delete':
        case 'Backspace':
          if (state.messages.selected && view === 'mail') {
            const msg = state.messages.selected
            if (msg.folder) {
              animateMessageRemoval(dispatch, [msg])
              window.api.imap.deleteMessage(msg.folder, msg.uid, false, state.auth.email)
            }
          }
          break
        case 'Escape':
          if (state.compose.isOpen) dispatch({ type: 'CLOSE_COMPOSE' })
          break
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [state.auth.isAuthenticated, state.compose.isOpen, state.messages.selected, view, dispatch, cmdkOpen])

  if (!state.auth.initialized) {
    return (
      <div className="app-root">
        <TitleBar />
        <div className="app-bootstrap" aria-label="Loading Kumo">
          <div className="app-bootstrap__mark">K</div>
        </div>
      </div>
    )
  }

  if (!state.auth.isAuthenticated) {
    return (
      <div className="app-root">
        <TitleBar />
        <SetupScreen />
      </div>
    )
  }

  return (
    <div className="app-root">
      <TitleBar connectionStatus={state.connectionStatus} />
      <UpdateBanner />
      <UndoSendToast />
      <div className="app-layout">
        <Rail />
        {view === 'mail' && (
          <>
            <div className="app-layout__sidebar">
              <Sidebar />
            </div>
            <div className="app-layout__msglist" ref={msglistRef} style={{ width: widths.current.msglist }}>
              <MessageList />
            </div>
            <div className="resize-handle resize-handle--vertical" onMouseDown={onMsglistDrag} />
            <div className="app-layout__reading">
              <ReadingPane />
            </div>
          </>
        )}
        {view === 'contacts' && <div className="app-layout__full"><ContactsPanel /></div>}
        {view === 'calendar' && <div className="app-layout__full"><CalendarPanel /></div>}
        {view === 'activity' && <div className="app-layout__full"><ActivityCenter /></div>}
        {view === 'search' && <div className="app-layout__full"><GlobalSearchPanel /></div>}
        {view === 'settings' && <div className="app-layout__full"><Settings /></div>}
      </div>
      {state.compose.isOpen && <ComposeWindow />}
{cmdkOpen && (
        <CommandPalette
          onClose={() => setCmdkOpen(false)}
          selectedMessage={state.messages.selected}
          currentTheme={state.settings.theme || 'light'}
          currentDensity={state.settings.displayDensity || 'compact'}
        />
      )}
    </div>
  )
}
