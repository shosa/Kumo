import React, { useEffect, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import {
  IconCompose, IconSettings, IconRefresh,
  IconSignOut, IconMarkRead, IconNoSymbol, IconEdit
} from './Icons'
import { getFolderIcon } from './folderIcons'

const FOLDER_LABEL_KEY = {
  '\\Inbox':   'folder.inbox',
  '\\Sent':    'folder.sent',
  '\\Drafts':  'folder.drafts',
  '\\Trash':   'folder.trash',
  '\\Junk':    'folder.junk',
  '\\Archive': 'folder.archive'
}

const SPECIAL_ORDER = {
  '\\Inbox': 0, '\\Sent': 1, '\\Drafts': 2, '\\Junk': 3, '\\Trash': 4, '\\Archive': 5
}

function folderSortKey(f) {
  return (f.special_use && SPECIAL_ORDER[f.special_use] !== undefined)
    ? SPECIAL_ORDER[f.special_use] : 99
}

// ── Avatar menu ───────────────────────────────────────────────────────────────

function AvatarMenu({ anchorRect, email, onClose, onSettings, onSignOut, t }) {
  const menuRef = useRef(null)
  const [pos, setPos] = useState({ x: anchorRect?.left || 0, y: anchorRect?.top || 0 })

  useEffect(() => {
    if (!menuRef.current || !anchorRect) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    let x = anchorRect.left
    let y = anchorRect.top - rect.height - 8
    if (x + rect.width > vw - 8) x = Math.max(8, vw - rect.width - 8)
    if (y < 8) y = anchorRect.bottom + 8
    setPos({ x, y })
  }, [anchorRect])

  useEffect(() => {
    const close = e => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose() }
    const esc   = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [onClose])

  return (
    <div ref={menuRef} className="context-menu" style={{ left: pos.x, top: pos.y }} role="menu">
      <div className="context-menu__header" style={{ userSelect: 'text' }}>{email}</div>
      <div className="context-menu__separator" />
      <div className="context-menu__item" onClick={onSettings} role="menuitem">
        <span className="context-menu__icon"><IconSettings size={15} /></span>
        <span>{t('sidebar.settings')}</span>
      </div>
      <div className="context-menu__separator" />
      <div className="context-menu__item context-menu__item--danger" onClick={onSignOut} role="menuitem">
        <span className="context-menu__icon"><IconSignOut size={15} /></span>
        <span>{t('sidebar.signOut')}</span>
      </div>
    </div>
  )
}

// ── Folder context menu ──────────────────────────────────────────────────────

function FolderMenu({ x, y, folder, onClose, onAction, isGlobalSyncing }) {
  const t = useTranslation()
  const menuRef = useRef(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    setPos({
      x: x + rect.width > vw - 8 ? Math.max(8, vw - rect.width - 8) : x,
      y: y + rect.height > vh - 8 ? Math.max(8, vh - rect.height - 8) : y
    })
  }, [x, y])

  useEffect(() => {
    const close = e => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose() }
    const esc = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [onClose])

  const isTrash = folder.special_use === '\\Trash'
  const isJunk  = folder.special_use === '\\Junk'
  const canEmpty = isTrash || isJunk

  const labelKey = FOLDER_LABEL_KEY[folder.special_use]
  const folderName = labelKey ? t(labelKey) : (folder.name || folder.path.split('/').pop())

  function act(type) { onAction(type); onClose() }

  return (
    <div ref={menuRef} className="context-menu" style={{ left: pos.x, top: pos.y }} role="menu">
      <div className="context-menu__header">{folderName}</div>
      <div className="context-menu__separator" />
      <div className="context-menu__item" onClick={() => act('markAllRead')} role="menuitem">
        <span className="context-menu__icon"><IconMarkRead size={15} /></span>
        <span>{t('folder.markAllRead')}</span>
      </div>
      <div className="context-menu__item" onClick={() => act('refresh')} role="menuitem">
        <span className="context-menu__icon">
          <IconRefresh size={15} className={isGlobalSyncing ? 'spin' : ''} />
        </span>
        <span>{isGlobalSyncing ? t('folder.refreshing') : t('folder.refresh')}</span>
      </div>
      {canEmpty && (
        <>
          <div className="context-menu__separator" />
          <div className="context-menu__item context-menu__item--danger" onClick={() => act('empty')} role="menuitem">
            <span className="context-menu__icon"><IconNoSymbol size={15} /></span>
            <span>{isTrash ? t('folder.emptyTrash') : t('folder.emptyJunk')}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const [folderMenu, setFolderMenu] = useState(null)
  const [avatarMenu, setAvatarMenu] = useState(false)
  const avatarRef = useRef(null)
  const [dragOverPath, setDragOverPath] = useState(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingOps, setPendingOps] = useState(0)

  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  const loadFolders = useCallback(async () => {
    dispatch({ type: 'SET_FOLDERS_LOADING', payload: true })
    dispatch({ type: 'SET_LOADING', payload: tRef.current('loading.folders') })
    const result = await window.api.imap.getFolders()
    if (result.ok) {
      dispatch({ type: 'SET_FOLDERS', payload: result.folders })
    } else {
      dispatch({ type: 'SET_FOLDERS_LOADING', payload: false })
    }
    dispatch({ type: 'CLEAR_LOADING' })
  }, [dispatch])

  // Load from cache immediately when authenticated
  useEffect(() => {
    if (!state.auth.isAuthenticated) return
    window.api.store.getCachedFolders().then(result => {
      if (result.ok && result.folders?.length > 0) {
        dispatch({ type: 'SET_FOLDERS', payload: result.folders })
      }
    })
  }, [state.auth.isAuthenticated, dispatch])

  // Refresh from IMAP when connection is established
  useEffect(() => {
    if (state.connectionStatus === 'connected') loadFolders()
  }, [state.connectionStatus, loadFolders])

  useEffect(() => {
    function refresh() {
      window.api.store.getPendingOpsCount?.().then(r => {
        if (r?.ok) setPendingOps(r.count)
      })
    }
    refresh()
    const offStart = window.api.on('sync:operation-start', refresh)
    const offEnd   = window.api.on('sync:operation-end',   refresh)
    return () => { offStart?.(); offEnd?.() }
  }, [])

  function selectFolder(path) {
    if (path === state.folders.selected) return
    dispatch({ type: 'SELECT_FOLDER', payload: path })
  }

  function openCompose()  { window.api.window.openCompose({ mode: 'new' }) }
  function openSettings() { dispatch({ type: 'TOGGLE_SETTINGS' }) }
  function signOut() {
    window.api.auth.deleteCredentials()
    window.api.imap.disconnect()
    dispatch({ type: 'SET_UNAUTHENTICATED' })
  }

  async function syncSelectedFolder() {
    if (state.folders.selected) {
      await window.api.imap.syncFolder(state.folders.selected)
    }
  }

  async function handleFolderAction(folder, type) {
    switch (type) {
      case 'markAllRead':
        dispatch({ type: 'SET_LOADING', payload: t('loading.marking') })
        await window.api.imap.markAllRead(folder.path)
        dispatch({ type: 'CLEAR_LOADING' })
        loadFolders()
        break
      case 'refresh':
        dispatch({ type: 'SYNC_OPERATION_START' })
        try {
          await loadFolders()
          await syncSelectedFolder()
        } finally {
          dispatch({ type: 'SYNC_OPERATION_END' })
        }
        break
      case 'empty':
        dispatch({ type: 'SET_LOADING', payload: t('loading.deleting') })
        await window.api.imap.emptyFolder(folder.path)
        dispatch({ type: 'CLEAR_LOADING' })
        // Clear messages if this folder is selected
        if (state.folders.selected === folder.path) {
          dispatch({ type: 'SET_MESSAGES', payload: { messages: [], total: 0, page: 1, hasMore: false } })
        }
        break
    }
  }

  function handleFolderDrop(targetFolder, e) {
    e.preventDefault()
    setDragOverPath(null)
    const raw = e.dataTransfer.getData('x-mail-messages')
    if (!raw) return
    let messages
    try { messages = JSON.parse(raw) } catch { return }
    const byFolder = {}
    messages.forEach(m => {
      if (m.folder === targetFolder.path) return
      ;(byFolder[m.folder] = byFolder[m.folder] || []).push(m.uid)
    })
    Object.entries(byFolder).forEach(([srcFolder, uids]) => {
      uids.forEach(uid => dispatch({ type: 'REMOVE_MESSAGE', payload: { uid, folder: srcFolder } }))
      window.api.imap.bulkMove(srcFolder, uids, targetFolder.path)
    })
  }

  const sorted = [...state.folders.list].sort((a, b) => folderSortKey(a) - folderSortKey(b))
  const systemFolders = sorted.filter(f => f.special_use)
  const customFolders = sorted.filter(f => !f.special_use)

  const isGlobalSyncing = state.sync?.operationsInProgress > 0

  return (
    <div className="sidebar" onClick={() => { setFolderMenu(null) }}>
      {/* Header: account info */}
      <div className="sidebar__head">
        <div className="sidebar__acct-label">iCloud</div>
        <div className="sidebar__acct-email">{state.auth.email || ''}</div>
      </div>

      {/* Compose button */}
      <button className="compose-btn" onClick={openCompose}>
        <IconEdit size={15} />
        {t('sidebar.compose')}
        <kbd>C</kbd>
      </button>

      {/* Folder list */}
      <div className="sidebar__scroll scroll">
        {state.folders.loading && state.folders.list.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        )}

        {systemFolders.length > 0 && (
          <>
            <div className="sidebar__group-label">{t('sidebar.mailboxes')}</div>
            {systemFolders.map(folder => (
              <FolderItem
                key={folder.path}
                folder={folder}
                selected={state.folders.selected === folder.path}
                dragOver={dragOverPath === folder.path}
                onClick={() => selectFolder(folder.path)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setFolderMenu({ x: e.clientX, y: e.clientY, folder }) }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverPath(folder.path) }}
                onDragLeave={() => setDragOverPath(null)}
                onDrop={e => handleFolderDrop(folder, e)}
                t={t}
              />
            ))}
          </>
        )}

        {customFolders.length > 0 && (
          <>
            <div className="sidebar__group-label" style={{ marginTop: '8px' }}>
              {t('sidebar.folders')}
            </div>
            {customFolders.map(folder => (
              <FolderItem
                key={folder.path}
                folder={folder}
                selected={state.folders.selected === folder.path}
                dragOver={dragOverPath === folder.path}
                onClick={() => selectFolder(folder.path)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setFolderMenu({ x: e.clientX, y: e.clientY, folder }) }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverPath(folder.path) }}
                onDragLeave={() => setDragOverPath(null)}
                onDrop={e => handleFolderDrop(folder, e)}
                t={t}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer: last sync + refresh */}
      <div className="sidebar__foot">
        <div className="storage">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', lineHeight: 1.4 }}>
              {state.sync?.lastActivity
                ? t('sidebar.lastSync') + ' ' + new Date(state.sync.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : t('sidebar.notSynced')}
            </div>
            {pendingOps > 0 && (
              <div style={{ fontSize: 11, color: 'var(--color-warning)', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-warning)', flexShrink: 0, display: 'inline-block' }} />
                {pendingOps} {pendingOps === 1 ? 'azione in sospeso' : 'azioni in sospeso'}
              </div>
            )}
          </div>
        </div>
        <button
          className="icon-btn"
          title={t('sidebar.refresh')}
          onClick={async () => {
            if (isSyncing) return
            setIsSyncing(true)
            try { await loadFolders(); await syncSelectedFolder() }
            finally { setIsSyncing(false) }
          }}
        >
          <IconRefresh size={16} className={isSyncing ? 'spin' : ''} />
        </button>
      </div>

      {/* Context menus via portals */}
      {folderMenu && createPortal(
        <FolderMenu
          x={folderMenu.x}
          y={folderMenu.y}
          folder={folderMenu.folder}
          onClose={() => setFolderMenu(null)}
          onAction={type => handleFolderAction(folderMenu.folder, type)}
          isGlobalSyncing={isGlobalSyncing}
        />,
        document.querySelector('.app-root') || document.body
      )}
    </div>
  )
}

function FolderItem({ folder, selected, dragOver, onClick, onContextMenu, onDragOver, onDragLeave, onDrop, t }) {
  const IconComp = getFolderIcon(folder)
  const labelKey = FOLDER_LABEL_KEY[folder.special_use]
  const name = labelKey ? t(labelKey) : (folder.name || folder.path.split('/').pop())
  const isInbox = folder.special_use === '\\Inbox'

  return (
    <div
      className={`folder${selected ? ' active' : ''}${dragOver ? ' drag-over' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      aria-label={`${name}${folder.unread_count > 0 ? `, ${folder.unread_count} non letti` : ''}`}
    >
      <span className="folder__icon"><IconComp size={17} /></span>
      <span className="folder__name">{name}</span>
      {folder.unread_count > 0 && (
        <span className={`folder__count${isInbox ? ' badge' : ''}`}>
          {folder.unread_count > 99 ? '99+' : folder.unread_count}
        </span>
      )}
    </div>
  )
}
