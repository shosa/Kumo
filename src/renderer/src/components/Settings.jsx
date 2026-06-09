import React, { useState, useEffect } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import { IconSignOut, IconGlobe, IconClearCache, IconCheck, IconFolderOpen, IconTrash } from './Icons'

export default function Settings() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const s = state.settings
  const email = state.auth.email || ''
  const initials = email.slice(0, 2).toUpperCase() || '?'

  const [appVersion,       setAppVersion]       = useState('')
  const [updateStatus,     setUpdateStatus]     = useState(null) // null | 'checking' | 'available' | 'not-available' | 'error'
  const [updateVersion,    setUpdateVersion]    = useState('')
  const [clearingContacts, setClearingContacts] = useState(false)
  const [contactsCleared,  setContactsCleared]  = useState(false)
  const [clearingCalendar, setClearingCalendar] = useState(false)
  const [calendarCleared,  setCalendarCleared]  = useState(false)
  const [dbPath,           setDbPath]           = useState('')
  const [confirmReset,     setConfirmReset]     = useState(false)
  const [resetting,        setResetting]        = useState(false)
  const [storageUsage,     setStorageUsage]     = useState(null)
  const [storageLoading,   setStorageLoading]   = useState(true)
  const [freeingSpace,     setFreeingSpace]     = useState(false)
  const [freedBytes,       setFreedBytes]       = useState(null)
  const [advancedOpen,     setAdvancedOpen]     = useState(false)
  const [confirmRebuild,   setConfirmRebuild]   = useState(false)
  const [rebuilding,       setRebuilding]       = useState(false)
  const [clearingLogs,     setClearingLogs]     = useState(false)
  const [logsCleared,      setLogsCleared]      = useState(false)
  const [storageError,     setStorageError]     = useState('')

  useEffect(() => {
    window.api.store.getDbPath?.().then(r => { if (r?.ok) setDbPath(r.path || '') })
    window.api.updater.version?.().then(v => { if (v) setAppVersion(v) })
    refreshStorageUsage()
  }, [])

  async function refreshStorageUsage() {
    setStorageLoading(true)
    const result = await window.api.store.getStorageUsage?.().catch(err => ({ ok: false, error: err.message }))
    if (result?.ok) {
      setStorageUsage(result.usage)
      setStorageError('')
    } else {
      setStorageError(result?.error || t('settings.storageError'))
    }
    setStorageLoading(false)
  }

  async function handleCheckUpdate() {
    console.log('[Updater] Starting check...')
    setUpdateStatus('checking')
    setUpdateVersion('')
    const off = window.api.on('updater:status', (data) => {
      console.log('[Updater] Status event:', data)
      if (data.event === 'available') {
        setUpdateStatus('available')
        setUpdateVersion(data.version || '')
        off?.()
      } else if (data.event === 'not-available') {
        setUpdateStatus('not-available')
        off?.()
      } else if (data.event === 'error') {
        setUpdateStatus('error')
        off?.()
      }
    })
    const result = await window.api.updater.check().catch(err => {
      console.error('[Updater] check() threw:', err)
      setUpdateStatus('error')
      off?.()
      return null
    })
    console.log('[Updater] check() resolved:', result)
  }

  function update(key, value) {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { [key]: value } })
    window.api.settings.save({ [key]: value })
  }

  function signOut() {
    window.api.auth.deleteCredentials()
    window.api.imap.disconnect()
    dispatch({ type: 'SET_UNAUTHENTICATED' })
  }

  async function handleFreeSpace() {
    setFreeingSpace(true)
    setFreedBytes(null)
    setStorageError('')
    const result = await window.api.store.freeSpace().catch(err => ({ ok: false, error: err.message }))
    if (result?.ok) {
      setStorageUsage(result.usage)
      setFreedBytes(result.freedBytes || 0)
      dispatch({ type: 'SELECT_MESSAGE', payload: null })
    } else {
      setStorageError(result?.error || t('settings.storageError'))
    }
    setFreeingSpace(false)
  }

  async function handleRebuildMailCache() {
    if (!confirmRebuild) {
      setConfirmRebuild(true)
      return
    }
    setRebuilding(true)
    setStorageError('')
    const result = await window.api.store.rebuildMailCache().catch(err => ({ ok: false, error: err.message }))
    if (result?.ok) {
      setStorageUsage(result.usage)
      setFreedBytes(result.freedBytes || 0)
      setConfirmRebuild(false)
      dispatch({ type: 'SET_FOLDERS', payload: [] })
      dispatch({ type: 'SET_MESSAGES', payload: { messages: [], total: 0, page: 1, hasMore: false } })
      window.api.imap.syncFolders?.()
    } else {
      setStorageError(
        result?.code === 'pending-sync-operations'
          ? t('settings.rebuildMailPending')
          : (result?.error || t('settings.storageError'))
      )
    }
    setRebuilding(false)
  }

  async function handleClearLogs() {
    setClearingLogs(true)
    setStorageError('')
    const result = await window.api.store.clearLogs().catch(err => ({ ok: false, error: err.message }))
    if (result?.ok) {
      setStorageUsage(result.usage)
      setLogsCleared(true)
      setTimeout(() => setLogsCleared(false), 2500)
    } else {
      setStorageError(result?.error || t('settings.storageError'))
    }
    setClearingLogs(false)
  }

  async function handleClearContacts() {
    setClearingContacts(true)
    setStorageError('')
    const result = await window.api.contacts.clear(email).catch(err => ({ ok: false, error: err.message }))
    if (result?.ok) {
      dispatch({ type: 'SET_CONTACTS', payload: [] })
      setContactsCleared(true)
      setTimeout(() => setContactsCleared(false), 2500)
      refreshStorageUsage()
    } else {
      setStorageError(result?.error || t('settings.storageError'))
    }
    setClearingContacts(false)
  }

  async function handleClearCalendar() {
    setClearingCalendar(true)
    setStorageError('')
    const result = await window.api.calendar.clear(email).catch(err => ({ ok: false, error: err.message }))
    if (result?.ok) {
      dispatch({ type: 'SET_CALENDAR_EVENTS', payload: [] })
      setCalendarCleared(true)
      setTimeout(() => setCalendarCleared(false), 2500)
      refreshStorageUsage()
    } else {
      setStorageError(result?.error || t('settings.storageError'))
    }
    setClearingCalendar(false)
  }

  async function handleResetAllData() {
    if (!confirmReset) { setConfirmReset(true); return }
    setResetting(true)
    setStorageError('')
    const result = await window.api.store.resetAllData().catch(err => ({ ok: false, error: err.message }))
    if (result?.ok) dispatch({ type: 'SET_UNAUTHENTICATED' })
    else {
      setStorageError(result?.error || t('settings.storageError'))
      setResetting(false)
    }
  }

  const Switch = ({ on, onChange }) => (
    <button className={`switch${on ? ' on' : ''}`} onClick={onChange} type="button" />
  )

  const SegSm = ({ value, options, onChange }) => (
    <div className="segsm">
      {options.map(([v, l]) => (
        <button key={v} className={value === v ? 'active' : ''} onClick={() => onChange(v)} type="button">{l}</button>
      ))}
    </div>
  )

  const ClearBtn = ({ loading, done, onClick, disabled }) => (
    <button
      className="icon-btn"
      onClick={onClick}
      disabled={disabled || loading}
      type="button"
      style={{ flexShrink: 0 }}
    >
      {loading
        ? <span className="spinner" style={{ width: 14, height: 14 }} />
        : done
          ? <IconCheck size={15} style={{ color: 'var(--color-success)' }} />
          : <IconClearCache size={15} />}
    </button>
  )

  const ACCENTS = ['#0071e3', '#5e5ebc', '#1f9d57', '#e0820b', '#e5484d']
  const formatBytes = (bytes = 0) => {
    if (bytes < 1024) return `${bytes} B`
    const units = ['KB', 'MB', 'GB']
    let value = bytes / 1024
    let unit = units[0]
    for (let index = 1; index < units.length && value >= 1024; index++) {
      value /= 1024
      unit = units[index]
    }
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${unit}`
  }
  const storageTotal = storageUsage?.total || 0
  const storageSegments = [
    { key: 'database', value: storageUsage?.database || 0, color: 'var(--accent)' },
    { key: 'attachments', value: storageUsage?.attachments || 0, color: '#7b61d1' },
    { key: 'logs', value: storageUsage?.logs || 0, color: '#d88a24' }
  ]

  return (
    <div className="full">
      <div className="settings scroll">
        <div className="settings__inner">
          <div className="settings__title">{t('settings.title')}</div>
          <div className="settings__sub">{t('settings.blockImagesDesc')}</div>

          {/* Aspetto */}
          <div className="sset">
            <div className="sset__label">{t('settings.appearance')}</div>
            <div className="sset__card">
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.theme')}</div>
                  <div className="srow__desc">{t('settings.themeDesc')}</div>
                </div>
                <SegSm
                  value={s.theme === 'dark' ? 'dark' : 'light'}
                  options={[['light', t('settings.themeLight')], ['dark', t('settings.themeDark')]]}
                  onChange={v => update('theme', v)}
                />
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.accentColor')}</div>
                  <div className="srow__desc">{t('settings.accentColorDesc')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ACCENTS.map(c => (
                    <button
                      key={c} type="button"
                      onClick={() => update('accentColor', c)}
                      style={{
                        width: 26, height: 26, borderRadius: 99, background: c, cursor: 'pointer',
                        border: (s.accentColor || '#0071e3') === c ? '2px solid var(--ink)' : '2px solid transparent',
                        boxShadow: '0 0 0 2px var(--surface-2)'
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.displayDensity')}</div>
                  <div className="srow__desc">{t('settings.densityDesc')}</div>
                </div>
                <SegSm
                  value={s.displayDensity === 'comfortable' ? 'comfortable' : 'compact'}
                  options={[['compact', t('settings.density.compact')], ['comfortable', t('settings.density.comfortable')]]}
                  onChange={v => update('displayDensity', v)}
                />
              </div>
            </div>
          </div>

          {/* Stile elenco */}
          <div className="sset">
            <div className="sset__label">{t('settings.listStyle')}</div>
            <div className="sset__card">
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.showAvatars')}</div>
                  <div className="srow__desc">{t('settings.showAvatarsDesc')}</div>
                </div>
                <Switch on={s.showAvatars !== false} onChange={() => update('showAvatars', !(s.showAvatars !== false))} />
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.showPreview')}</div>
                  <div className="srow__desc">{t('settings.showPreviewDesc')}</div>
                </div>
                <Switch on={s.showPreview !== false} onChange={() => update('showPreview', !(s.showPreview !== false))} />
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className="sset">
            <div className="sset__label">{t('settings.privacy')}</div>
            <div className="sset__card">
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.showSenderLogos')}</div>
                  <div className="srow__desc">{t('settings.showSenderLogosDesc')}</div>
                </div>
                <Switch on={s.showSenderLogos === true} onChange={() => update('showSenderLogos', s.showSenderLogos !== true)} />
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.blockImages')}</div>
                  <div className="srow__desc">{t('settings.blockImagesDesc')}</div>
                </div>
                <Switch on={s.blockRemoteImages !== false} onChange={() => update('blockRemoteImages', !s.blockRemoteImages)} />
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.notificationsEnabled')}</div>
                  <div className="srow__desc">{t('settings.notificationsDesc')}</div>
                </div>
                <Switch on={s.notificationsEnabled !== false} onChange={() => update('notificationsEnabled', !s.notificationsEnabled)} />
              </div>
            </div>
          </div>

          {/* Dati e cache */}
          <div className="sset">
            <div className="sset__label">{t('settings.localStorage')}</div>
            <div className="storage-card">
              <div className="storage-card__summary">
                <div>
                  <div className="storage-card__total">
                    {storageLoading ? '...' : formatBytes(storageTotal)}
                  </div>
                  <div className="storage-card__caption">{t('settings.storageUsed')}</div>
                </div>
                <button
                  className="act act--primary"
                  type="button"
                  onClick={handleFreeSpace}
                  disabled={freeingSpace || storageLoading}
                >
                  {freeingSpace
                    ? <><span className="spinner" style={{ width: 12, height: 12 }} /> {t('settings.cleaningStorage')}</>
                    : t('settings.freeSpace')}
                </button>
              </div>

              <div className="storage-meter" aria-label={t('settings.storageBreakdown')}>
                {storageSegments.map(segment => (
                  <span
                    key={segment.key}
                    style={{
                      width: storageTotal > 0 ? `${Math.max(2, (segment.value / storageTotal) * 100)}%` : 0,
                      background: segment.color
                    }}
                  />
                ))}
              </div>

              <div className="storage-grid">
                {storageSegments.map(segment => (
                  <div className="storage-stat" key={segment.key}>
                    <span className="storage-stat__dot" style={{ background: segment.color }} />
                    <span>{t(`settings.storage.${segment.key}`)}</span>
                    <b>{formatBytes(segment.value)}</b>
                  </div>
                ))}
              </div>

              <div className="storage-card__detail">
                {t('settings.freeSpaceDesc')}
              </div>
              {freedBytes !== null && (
                <div className="storage-feedback storage-feedback--success">
                  <IconCheck size={14} /> {t('settings.storageFreed', formatBytes(freedBytes))}
                </div>
              )}
              {storageError && (
                <div className="storage-feedback storage-feedback--error">{storageError}</div>
              )}
            </div>

            <div className="sset__card storage-actions">
              <button className="srow srow--button" type="button" onClick={() => setAdvancedOpen(value => !value)}>
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.manageStorage')}</div>
                  <div className="srow__desc">{t('settings.manageStorageDesc')}</div>
                </div>
                <span className={`storage-chevron${advancedOpen ? ' open' : ''}`}>›</span>
              </button>

              {advancedOpen && (
                <div className="storage-advanced">
                  <div className="srow">
                    <div className="srow__txt">
                      <div className="srow__name">{t('settings.rebuildMailCache')}</div>
                      <div className="srow__desc">
                        {confirmRebuild ? t('settings.confirmRebuildMail') : t('settings.rebuildMailCacheDesc')}
                      </div>
                    </div>
                    <button
                      className={`act${confirmRebuild ? ' act--danger' : ''}`}
                      type="button"
                      onClick={handleRebuildMailCache}
                      disabled={rebuilding}
                      onBlur={() => setConfirmRebuild(false)}
                    >
                      {rebuilding ? <span className="spinner" style={{ width: 12, height: 12 }} /> : t('settings.rebuild')}
                    </button>
                  </div>
                  <div className="srow">
                    <div className="srow__txt">
                      <div className="srow__name">{t('settings.clearContacts')}</div>
                      <div className="srow__desc">{t('settings.clearContactsDesc')}</div>
                    </div>
                    <ClearBtn loading={clearingContacts} done={contactsCleared} onClick={handleClearContacts} />
                  </div>
                  <div className="srow">
                    <div className="srow__txt">
                      <div className="srow__name">{t('settings.clearCalendar')}</div>
                      <div className="srow__desc">{t('settings.clearCalendarDesc')}</div>
                    </div>
                    <ClearBtn loading={clearingCalendar} done={calendarCleared} onClick={handleClearCalendar} />
                  </div>
                  <div className="srow">
                    <div className="srow__txt">
                      <div className="srow__name">{t('settings.clearLogs')}</div>
                      <div className="srow__desc">{t('settings.clearLogsDesc')}</div>
                    </div>
                    <ClearBtn loading={clearingLogs} done={logsCleared} onClick={handleClearLogs} />
                  </div>
                </div>
              )}

              {dbPath && (
                <button className="srow srow--button" type="button" onClick={() => window.api.store.openDbFolder?.()}>
                  <div className="srow__txt">
                    <div className="srow__name">{t('settings.openDataFolder')}</div>
                    <div className="srow__desc">{dbPath}</div>
                  </div>
                  <IconFolderOpen size={15} />
                </button>
              )}
            </div>

            <div className="storage-danger">
              <div className="srow__txt">
                <div className="srow__name">{t('settings.resetData')}</div>
                <div className="srow__desc">{confirmReset ? t('settings.confirmReset') : t('settings.resetDataDesc')}</div>
              </div>
              <button
                className={`act${confirmReset ? ' act--danger' : ''}`}
                type="button"
                onClick={handleResetAllData}
                disabled={resetting}
                onBlur={() => setConfirmReset(false)}
              >
                {resetting
                  ? <span className="spinner" style={{ width: 12, height: 12 }} />
                  : <><IconTrash size={14} /> {t('settings.reset')}</>}
              </button>
            </div>
          </div>

          {/* Updates */}
          <div className="sset">
            <div className="sset__label">{t('settings.updates')}</div>
            <div className="sset__card">
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.version')}</div>
                  <div className="srow__desc">Kumo {appVersion || '—'}</div>
                </div>
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.updateNotifications')}</div>
                  <div className="srow__desc">{t('settings.updateNotificationsDesc')}</div>
                </div>
                <label className="tog">
                  <input
                    type="checkbox"
                    checked={s.updatesEnabled !== false}
                    onChange={e => update('updatesEnabled', e.target.checked)}
                  />
                  <span className="tog__track" />
                </label>
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.checkUpdates')}</div>
                  <div className="srow__desc" style={{
                    color: updateStatus === 'available'     ? 'var(--color-success)'
                         : updateStatus === 'error'         ? 'var(--color-error)'
                         : 'var(--ink-3)'
                  }}>
                    {updateStatus === 'checking'      ? t('settings.checkingUpdates')
                   : updateStatus === 'available'     ? t('settings.updateAvailable', updateVersion)
                   : updateStatus === 'not-available' ? t('settings.upToDate')
                   : updateStatus === 'error'         ? t('settings.updateError')
                   : t('settings.checkUpdatesDesc')}
                  </div>
                </div>
                <button
                  className="act"
                  onClick={handleCheckUpdate}
                  disabled={updateStatus === 'checking'}
                  type="button"
                >
                  {updateStatus === 'checking'
                    ? <><span className="spinner" style={{ width: 12, height: 12 }} /> {t('settings.checkingUpdates')}</>
                    : t('settings.checkUpdates')}
                </button>
              </div>
            </div>
          </div>

          {/* Account */}
          <div className="sset">
            <div className="sset__label">{t('settings.account')}</div>
            <div className="sset__card">
              <div className="srow">
                <div
                  className="reader__sender-av"
                  style={{ width: 38, height: 38, fontSize: 13, background: 'linear-gradient(150deg,#0071e3,#5e5ebc)', flexShrink: 0 }}
                >
                  {initials}
                </div>
                <div className="srow__txt">
                  <div className="srow__name">{email}</div>
                </div>
                <button className="act" onClick={signOut} type="button">
                  <IconSignOut size={15} /> {t('settings.signOut')}
                </button>
              </div>
              <div className="srow">
                <span style={{ color: 'var(--ink-3)', flexShrink: 0 }}><IconGlobe size={17} /></span>
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.language')}</div>
                  <div className="srow__desc">{t('settings.languageLabel')}</div>
                </div>
                <select
                  value={s.language || 'it-IT'}
                  onChange={e => update('language', e.target.value)}
                  style={{
                    background: 'var(--surface-3)', border: '1px solid var(--line)',
                    borderRadius: 'var(--r-sm)', color: 'var(--ink)', fontSize: 12.5,
                    padding: '5px 8px', cursor: 'pointer', flexShrink: 0,
                    fontFamily: 'var(--sans)'
                  }}
                >
                  <option value="it-IT">Italiano</option>
                  <option value="en-US">English</option>
                  <option value="fr-FR">Français</option>
                  <option value="de-DE">Deutsch</option>
                  <option value="es-ES">Español</option>
                  <option value="pt-BR">Português (BR)</option>
                  <option value="ru-RU">Русский</option>
                  <option value="zh-CN">中文 (简体)</option>
                  <option value="ja-JP">日本語</option>
                  <option value="ko-KR">한국어</option>
                  <option value="tr-TR">Türkçe</option>
                  <option value="nl-NL">Nederlands</option>
                </select>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
