import React, { useState, useEffect } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import {
  IconSignOut, IconGlobe, IconClearCache, IconCheck, IconFolderOpen, IconTrash,
  IconSettings, IconEdit, IconStar, IconNoSymbol, IconMarkRead, IconArchive,
  IconRefresh, IconContacts
} from './Icons'
import RichTextEditor from './RichTextEditor'

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
  const [updateError,      setUpdateError]      = useState('')
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
  const [rules,            setRules]            = useState([])
  const [activeCategory,   setActiveCategory]   = useState('general')
  const [exportingLogs,    setExportingLogs]    = useState(false)
  const [exportedLogs,     setExportedLogs]     = useState(false)

  useEffect(() => {
    window.api.store.getDbPath?.().then(r => { if (r?.ok) setDbPath(r.path || '') })
    window.api.updater.version?.().then(v => { if (v) setAppVersion(v) })
    refreshStorageUsage()
    refreshRules()
  }, [])

  async function refreshRules() {
    const result = await window.api.rules.list()
    if (result.ok) setRules(result.rules || [])
  }

  function createRule() {
    setRules(previous => [...previous, {
      name: t('rules.newRule'),
      enabled: true,
      match: { from: '' },
      action: { type: 'markRead' },
      stop_after: true,
      isNew: true
    }])
  }

  function patchRule(index, patch) {
    setRules(previous => previous.map((rule, ruleIndex) =>
      ruleIndex === index ? { ...rule, ...patch } : rule
    ))
  }

  async function persistRule(index) {
    const rule = rules[index]
    const result = await window.api.rules.save(rule)
    if (!result.ok) return
    await refreshRules()
    update('rulesVersion', Date.now())
  }

  async function removeRule(index) {
    const rule = rules[index]
    if (rule.id) await window.api.rules.delete(rule.id)
    setRules(previous => previous.filter((_, ruleIndex) => ruleIndex !== index))
    update('rulesVersion', Date.now())
  }

  function setRuleMatch(index, field, value) {
    patchRule(index, { match: value ? { [field]: value } : { [field]: '' } })
  }

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
    setUpdateStatus('checking')
    setUpdateVersion('')
    setUpdateError('')
    const result = await window.api.updater.check()
      .catch(err => ({ ok: false, error: err.message }))
    if (!result?.ok) {
      setUpdateError(result?.error || '')
      setUpdateStatus('error')
      return
    }
    setUpdateVersion(result.version || '')
    setUpdateStatus(result.status === 'available' ? 'available' : 'not-available')
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

  async function handleExportDiagnostics() {
    if (exportingLogs) return
    setExportingLogs(true)
    setStorageError('')
    const result = await window.api.store.exportDiagnostics()
      .catch(err => ({ ok: false, error: err.message }))
    if (result?.ok) {
      setExportedLogs(true)
      setTimeout(() => setExportedLogs(false), 2500)
    } else if (!result?.canceled) {
      setStorageError(result?.error || t('settings.storageError'))
    }
    setExportingLogs(false)
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
  const categories = [
    ['general', t('settings.category.general'), IconSettings],
    ['writing', t('settings.category.writing'), IconEdit],
    ['appearance', t('settings.category.appearance'), IconStar],
    ['privacy', t('settings.category.privacy'), IconNoSymbol],
    ['rules', t('settings.category.rules'), IconMarkRead],
    ['data', t('settings.category.data'), IconArchive],
    ['updates', t('settings.category.updates'), IconRefresh],
    ['account', t('settings.category.account'), IconContacts]
  ]

  return (
    <div className="full">
      <div className="settings">
        <aside className="settings__nav" aria-label={t('settings.title')}>
          <div className="settings__nav-title">{t('settings.title')}</div>
          {categories.map(([key, label, CategoryIcon]) => (
            <button
              key={key}
              className={`settings__nav-item${activeCategory === key ? ' active' : ''}`}
              type="button"
              onClick={() => setActiveCategory(key)}
            >
              <CategoryIcon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </aside>
        <div className="settings__content scroll">
        <div className="settings__inner">
          <div className="settings__title">{categories.find(([key]) => key === activeCategory)?.[1]}</div>
          <div className="settings__sub">{t(`settings.category.${activeCategory}Desc`)}</div>

          {/* Aspetto */}
          {activeCategory === 'appearance' && <>
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
          </>}

          {/* Privacy */}
          {activeCategory === 'privacy' && (
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
          )}

          {activeCategory === 'general' && (
          <div className="sset">
            <div className="sset__label">{t('settings.category.general')}</div>
            <div className="sset__card">
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.closeBehavior')}</div>
                  <div className="srow__desc">{t('settings.closeBehaviorDesc')}</div>
                </div>
                <select
                  value={s.closeBehavior || 'ask'}
                  onChange={event => update('closeBehavior', event.target.value)}
                  className="settings-select"
                >
                  <option value="ask">{t('settings.closeBehaviorAsk')}</option>
                  <option value="tray">{t('settings.closeBehaviorTray')}</option>
                  <option value="quit">{t('settings.closeBehaviorQuit')}</option>
                </select>
              </div>
              <div className="srow">
                <span className="settings-row-icon"><IconGlobe size={17} /></span>
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.language')}</div>
                  <div className="srow__desc">{t('settings.languageLabel')}</div>
                </div>
                <select
                  value={s.language || 'it-IT'}
                  onChange={e => update('language', e.target.value)}
                  className="settings-select"
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
          )}

          {activeCategory === 'writing' && <>
          <div className="sset">
            <div className="sset__label">{t('settings.mailBehavior')}</div>
            <div className="sset__card">
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.undoSend')}</div>
                  <div className="srow__desc">{t('settings.undoSendDesc')}</div>
                </div>
                <select
                  value={Number(s.undoSendDelay ?? 10)}
                  onChange={event => update('undoSendDelay', Number(event.target.value))}
                  className="settings-select"
                >
                  {[0, 5, 10, 20, 30].map(seconds => (
                    <option key={seconds} value={seconds}>
                      {seconds === 0 ? t('settings.undoOff') : `${seconds}s`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">{t('settings.conversationView')}</div>
                  <div className="srow__desc">{t('settings.conversationViewDesc')}</div>
                </div>
                <Switch
                  on={s.conversationView !== false}
                  onChange={() => update('conversationView', s.conversationView === false)}
                />
              </div>
            </div>
          </div>
          <div className="sset">
            <div className="sset__label">{t('settings.signature')}</div>
            <div className="sset__card signature-settings">
              <div className="signature-settings__intro">
                <div className="srow__name">{t('settings.signature')}</div>
                <div className="srow__desc">{t('settings.signatureDesc')}</div>
              </div>
              <RichTextEditor
                value={s.signature || ''}
                onChange={html => update('signature', html)}
                placeholder={t('settings.signaturePlaceholder')}
                className="signature-settings__editor"
              />
            </div>
          </div>
          </>}

          {activeCategory === 'rules' && (
          <div className="sset">
            <div className="sset__label">{t('rules.title')}</div>
            <div className="sset__card rules-card">
              {rules.map((rule, index) => {
                const matchField = Object.keys(rule.match || {})[0] || 'from'
                const matchValue = rule.match?.[matchField] ?? ''
                return (
                  <div className="rule-editor" key={rule.id || `new-${index}`}>
                    <div className="rule-editor__top">
                      <input
                        className="settings-input"
                        value={rule.name || ''}
                        onChange={event => patchRule(index, { name: event.target.value })}
                        placeholder={t('rules.name')}
                      />
                      <Switch
                        on={rule.enabled !== false}
                        onChange={() => patchRule(index, { enabled: rule.enabled === false })}
                      />
                    </div>
                    <div className="rule-editor__grid">
                      <select
                        className="settings-select"
                        value={matchField}
                        onChange={event => setRuleMatch(index, event.target.value, matchValue)}
                      >
                        <option value="from">{t('rules.from')}</option>
                        <option value="subject">{t('rules.subject')}</option>
                        <option value="text">{t('rules.text')}</option>
                      </select>
                      <input
                        className="settings-input"
                        value={matchValue}
                        onChange={event => setRuleMatch(index, matchField, event.target.value)}
                        placeholder={t('rules.contains')}
                      />
                      <select
                        className="settings-select"
                        value={rule.action?.type || 'markRead'}
                        onChange={event => patchRule(index, {
                          action: event.target.value === 'move'
                            ? { type: 'move', destination: state.folders.list.find(folder => !folder.special_use)?.path || 'Archive' }
                            : { type: event.target.value }
                        })}
                      >
                        <option value="markRead">{t('rules.markRead')}</option>
                        <option value="star">{t('rules.star')}</option>
                        <option value="move">{t('rules.move')}</option>
                      </select>
                      {rule.action?.type === 'move' && (
                        <select
                          className="settings-select"
                          value={rule.action.destination || ''}
                          onChange={event => patchRule(index, {
                            action: { ...rule.action, destination: event.target.value }
                          })}
                        >
                          {state.folders.list.filter(folder => !String(folder.path).startsWith('smart:')).map(folder => (
                            <option key={folder.path} value={folder.path}>
                              {folder.name || folder.path}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="rule-editor__actions">
                      <button className="act" type="button" onClick={() => removeRule(index)}>
                        <IconTrash size={14} /> {t('action.delete')}
                      </button>
                      <button className="act act--primary" type="button" onClick={() => persistRule(index)}>
                        <IconCheck size={14} /> {t('settings.save')}
                      </button>
                    </div>
                  </div>
                )
              })}
              <button className="srow srow--button" type="button" onClick={createRule}>
                <div className="srow__txt">
                  <div className="srow__name">{t('rules.add')}</div>
                  <div className="srow__desc">{t('rules.addDesc')}</div>
                </div>
                <span>+</span>
              </button>
            </div>
          </div>
          )}

          {/* Dati e cache */}
          {activeCategory === 'data' && (
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
                      <div className="srow__name">{t('settings.exportDiagnostics')}</div>
                      <div className="srow__desc">{t('settings.exportDiagnosticsDesc')}</div>
                    </div>
                    <button className="act" type="button" onClick={handleExportDiagnostics} disabled={exportingLogs}>
                      {exportingLogs
                        ? <span className="spinner" style={{ width: 12, height: 12 }} />
                        : exportedLogs ? <IconCheck size={14} /> : t('settings.export')}
                    </button>
                  </div>
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
          )}

          {/* Updates */}
          {activeCategory === 'updates' && (
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
                   : updateStatus === 'error'         ? `${t('settings.updateError')}${updateError ? `: ${updateError}` : ''}`
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
          )}

          {/* Account */}
          {activeCategory === 'account' && (
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
            </div>
          </div>
          )}

        </div>
        </div>
      </div>
    </div>
  )
}
