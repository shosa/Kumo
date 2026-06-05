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
  const [clearingMsgs,     setClearingMsgs]     = useState(false)
  const [msgsCleared,      setMsgsCleared]      = useState(false)
  const [clearingCache,    setClearingCache]    = useState(false)
  const [cacheCleared,     setCacheCleared]     = useState(false)
  const [clearingFolders,  setClearingFolders]  = useState(false)
  const [foldersCleared,   setFoldersCleared]   = useState(false)
  const [clearingContacts, setClearingContacts] = useState(false)
  const [contactsCleared,  setContactsCleared]  = useState(false)
  const [clearingCalendar, setClearingCalendar] = useState(false)
  const [calendarCleared,  setCalendarCleared]  = useState(false)
  const [dbPath,           setDbPath]           = useState('')
  const [confirmReset,     setConfirmReset]     = useState(false)
  const [resetting,        setResetting]        = useState(false)

  useEffect(() => {
    window.api.store.getDbPath?.().then(r => { if (r?.ok) setDbPath(r.path || '') })
    window.api.updater.version?.().then(v => { if (v) setAppVersion(v) })
  }, [])

  async function handleCheckUpdate() {
    setUpdateStatus('checking')
    setUpdateVersion('')
    const off = window.api.on('updater:status', (data) => {
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
    await window.api.updater.check().catch(() => { setUpdateStatus('error'); off?.() })
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

  async function handleClearMessages() {
    setClearingMsgs(true)
    await window.api.store.clearMessages()
    dispatch({ type: 'SET_MESSAGES', payload: { messages: [], total: 0, page: 1, hasMore: false } })
    setClearingMsgs(false); setMsgsCleared(true)
    setTimeout(() => setMsgsCleared(false), 2500)
  }

  async function handleClearCache() {
    setClearingCache(true)
    await window.api.store.clearBodyCache()
    setClearingCache(false); setCacheCleared(true)
    setTimeout(() => setCacheCleared(false), 2500)
  }

  async function handleClearFolderCache() {
    setClearingFolders(true)
    await window.api.store.clearFolderCache()
    setClearingFolders(false); setFoldersCleared(true)
    setTimeout(() => setFoldersCleared(false), 2500)
  }

  async function handleClearContacts() {
    setClearingContacts(true)
    await window.api.contacts.clear(email)
    dispatch({ type: 'SET_CONTACTS', payload: [] })
    setClearingContacts(false); setContactsCleared(true)
    setTimeout(() => setContactsCleared(false), 2500)
  }

  async function handleClearCalendar() {
    setClearingCalendar(true)
    await window.api.calendar.clear(email)
    dispatch({ type: 'SET_CALENDAR_EVENTS', payload: [] })
    setClearingCalendar(false); setCalendarCleared(true)
    setTimeout(() => setCalendarCleared(false), 2500)
  }

  async function handleResetAllData() {
    if (!confirmReset) { setConfirmReset(true); return }
    setResetting(true)
    await window.api.store.resetAllData()
    dispatch({ type: 'SET_UNAUTHENTICATED' })
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
            <div className="sset__label">{t('settings.dataAndCache')}</div>
            <div className="sset__card">
              {dbPath && (
                <div className="srow">
                  <div className="srow__txt">
                    <div className="srow__name">{t('settings.dbLocation')}</div>
                    <div className="srow__desc" style={{ wordBreak: 'break-all', userSelect: 'text' }}>{dbPath}</div>
                  </div>
                  <button className="icon-btn" type="button" onClick={() => window.api.store.openDbFolder?.()} title={t('settings.openFolder')} style={{ flexShrink: 0 }}>
                    <IconFolderOpen size={15} />
                  </button>
                </div>
              )}
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.clearMessages')}</div>
                  <div className="srow__desc">{t('settings.clearMessagesDesc')}</div>
                </div>
                <ClearBtn loading={clearingMsgs} done={msgsCleared} onClick={handleClearMessages} />
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.clearBodyCache')}</div>
                  <div className="srow__desc">{t('settings.clearBodyCacheDesc')}</div>
                </div>
                <ClearBtn loading={clearingCache} done={cacheCleared} onClick={handleClearCache} />
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.clearFolderCache')}</div>
                  <div className="srow__desc">{t('settings.clearFolderCacheDesc')}</div>
                </div>
                <ClearBtn loading={clearingFolders} done={foldersCleared} onClick={handleClearFolderCache} />
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
                  <div className="srow__name" style={{ color: 'var(--color-error)' }}>{t('settings.resetData')}</div>
                  <div className="srow__desc">{confirmReset ? t('settings.confirmReset') : t('settings.resetDataDesc')}</div>
                </div>
                <button
                  className="icon-btn"
                  type="button"
                  onClick={handleResetAllData}
                  disabled={resetting}
                  onBlur={() => setConfirmReset(false)}
                  style={{ flexShrink: 0, color: confirmReset ? 'var(--color-error)' : undefined }}
                >
                  {resetting
                    ? <span className="spinner" style={{ width: 14, height: 14 }} />
                    : <IconTrash size={15} />}
                </button>
              </div>
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
