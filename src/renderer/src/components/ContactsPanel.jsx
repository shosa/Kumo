import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import {
  IconSearch, IconContacts, IconMail, IconPhone, IconBuilding, IconPin,
  IconSync, IconCompose, IconEdit, IconTrash, IconClose
} from './Icons'

const AVATAR_COLORS = ['#0071e3','#5e5ebc','#bf5af2','#ff6b35','#30a46c','#e0820b','#e5484d','#0e9bd6']

function avatarColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function getInitials(name = '') {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase() || '?'
}

function formatBirthday(val) {
  if (!val) return null
  const m = val.replace(/-/g, '').match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!m) return val
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
}

function ContactEditor({ contact, onClose, onSaved, t, accountEmail }) {
  const [form, setForm] = useState(() => ({
    ...contact,
    display_name: contact?.display_name || '',
    first_name: contact?.first_name || '',
    last_name: contact?.last_name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    organization: contact?.organization || '',
    title: contact?.title || '',
    birthday: contact?.birthday || '',
    notes: contact?.notes || ''
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm(current => ({ ...current, [field]: value }))
  }

  async function save(event) {
    event.preventDefault()
    if (!form.display_name.trim() && !form.email.trim()) return
    setSaving(true)
    setError('')
    const result = await window.api.contacts.save({
      ...form,
      account_email: accountEmail,
      emails: form.email ? [form.email] : [],
      phones: form.phone ? [form.phone] : []
    }, accountEmail)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || t('contacts.saveFailed'))
      return
    }
    onSaved(result.contact)
  }

  return (
    <div className="editor-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="editor-card" onSubmit={save}>
        <div className="editor-card__head">
          <div>
            <div className="editor-card__eyebrow">{t('nav.contacts')}</div>
            <h2>{contact?.id ? t('contacts.edit') : t('contacts.new')}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}><IconClose size={17} /></button>
        </div>
        <div className="editor-grid">
          <label><span>{t('contacts.displayName')}</span><input autoFocus value={form.display_name} onChange={event => update('display_name', event.target.value)} /></label>
          <label><span>{t('contacts.fieldEmail')}</span><input type="email" value={form.email} onChange={event => update('email', event.target.value)} /></label>
          <label><span>{t('contacts.firstName')}</span><input value={form.first_name} onChange={event => update('first_name', event.target.value)} /></label>
          <label><span>{t('contacts.lastName')}</span><input value={form.last_name} onChange={event => update('last_name', event.target.value)} /></label>
          <label><span>{t('contacts.fieldPhone')}</span><input value={form.phone} onChange={event => update('phone', event.target.value)} /></label>
          <label><span>{t('contacts.fieldCompany')}</span><input value={form.organization} onChange={event => update('organization', event.target.value)} /></label>
          <label><span>{t('contacts.jobTitle')}</span><input value={form.title} onChange={event => update('title', event.target.value)} /></label>
          <label><span>{t('contacts.fieldBirthday')}</span><input type="date" value={form.birthday} onChange={event => update('birthday', event.target.value)} /></label>
          <label className="editor-grid__wide"><span>{t('contacts.fieldNotes')}</span><textarea rows="4" value={form.notes} onChange={event => update('notes', event.target.value)} /></label>
        </div>
        {error && <div className="editor-error">{error}</div>}
        <div className="editor-card__actions">
          <button className="btn btn--ghost" type="button" onClick={onClose}>{t('action.cancel')}</button>
          <button className="btn btn--primary" disabled={saving} type="submit">{saving ? t('toolbar.syncing') : t('action.save')}</button>
        </div>
      </form>
    </div>
  )
}

export default function ContactsPanel() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [editing, setEditing] = useState(null)

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    dispatch({ type: 'SET_CONTACTS_SYNCING', payload: true })
    try {
      const credRes = await window.api.auth.getCredentials()
      if (credRes.ok && credRes.creds?.password) {
        await window.api.contacts.sync(credRes.creds.email, credRes.creds.password)
        const listRes = await window.api.contacts.list(credRes.creds.email)
        if (listRes.ok) dispatch({ type: 'SET_CONTACTS', payload: listRes.contacts })
      }
    } finally {
      setSyncing(false)
      dispatch({ type: 'SET_CONTACTS_SYNCING', payload: false })
    }
  }

  const loadContacts = useCallback(async () => {
    const email = state.auth.email
    if (!email) return
    dispatch({ type: 'SET_CONTACTS_LOADING', payload: true })
    const res = await window.api.contacts.list(email)
    if (res.ok) dispatch({ type: 'SET_CONTACTS', payload: res.contacts })
    else dispatch({ type: 'SET_CONTACTS_LOADING', payload: false })
  }, [state.auth.email, dispatch])

  useEffect(() => {
    if (state.auth.isAuthenticated && state.contacts.list.length === 0) {
      loadContacts()
    }
  }, [state.auth.isAuthenticated, state.contacts.list.length, loadContacts])

  const filtered = searchQuery.trim()
    ? state.contacts.list.filter(c => {
        const q = searchQuery.toLowerCase()
        return (c.display_name || '').toLowerCase().includes(q)
          || (c.email || '').toLowerCase().includes(q)
          || (c.organization || '').toLowerCase().includes(q)
      })
    : state.contacts.list

  const groupedContacts = useMemo(() => {
    const sorted = [...filtered].sort((a, b) =>
      (a.display_name || a.email || '').localeCompare(b.display_name || b.email || '')
    )
    const map = {}
    sorted.forEach(c => {
      const letter = ((c.display_name || c.email || '?')[0]).toUpperCase()
      if (!map[letter]) map[letter] = []
      map[letter].push(c)
    })
    return Object.entries(map).map(([letter, contacts]) => ({ letter, contacts }))
  }, [filtered])

  const selected = state.contacts.selected

  function selectContact(c) {
    dispatch({ type: 'SELECT_CONTACT', payload: c })
  }

  function handleComposeToContact(contact) {
    const email = contact.email || (contact.emails && contact.emails[0]) || ''
    window.api.window.openCompose({ mode: 'new', to: email })
  }

  function handleSaved(contact) {
    const list = state.contacts.list.some(item => item.id === contact.id)
      ? state.contacts.list.map(item => item.id === contact.id ? contact : item)
      : [...state.contacts.list, contact]
    dispatch({ type: 'SET_CONTACTS', payload: list })
    dispatch({ type: 'SELECT_CONTACT', payload: contact })
    setEditing(null)
  }

  async function handleDelete(contact) {
    if (!window.confirm(t('contacts.deleteConfirm'))) return
    const result = await window.api.contacts.delete(contact, state.auth.email)
    if (!result.ok) return
    dispatch({ type: 'SET_CONTACTS', payload: state.contacts.list.filter(item => item.id !== contact.id) })
    dispatch({ type: 'SELECT_CONTACT', payload: null })
  }

  return (
    <div className="full">
      {/* left column */}
      <div className="contacts__list">
        <div className="contacts__head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', flex: 1 }}>{t('nav.contacts')}</span>
            <button
              className="icon-btn"
              onClick={handleSync}
              disabled={syncing}
              title={syncing ? t('toolbar.syncing') : t('toolbar.sync')}
            >
              <IconSync size={16} className={syncing ? 'spin' : ''} />
            </button>
            <button className="icon-btn" onClick={() => setEditing({})} title={t('contacts.new')}>
              <IconCompose size={16} />
            </button>
          </div>
          <div className="search">
            <span className="search__icon"><IconSearch size={15} /></span>
            <input
              placeholder={t('contacts.search')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="contacts__scroll scroll">
          {state.contacts.loading && filtered.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <div className="spinner" />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: 'var(--ink-4)' }}>
              <IconContacts size={44} style={{ marginBottom: 12, opacity: 0.2 }} />
              <span style={{ fontSize: 13 }}>
                {searchQuery ? t('messages.noResults') : t('contacts.empty')}
              </span>
            </div>
          ) : (
            groupedContacts.map(({ letter, contacts }) => (
              <React.Fragment key={letter}>
                <div className="contacts__alpha">{letter}</div>
                {contacts.map(c => (
                  <div
                    key={c.id || c.email}
                    className={`crow${selected?.id === c.id ? ' active' : ''}`}
                    onClick={() => selectContact(c)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && selectContact(c)}
                  >
                    <div className="crow__av" style={{ background: avatarColor(c.display_name || c.email) }}>
                      {getInitials(c.display_name || c.email || '')}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="crow__name">{c.display_name || c.email}</div>
                      <div className="crow__sub">{c.organization || (c.display_name ? c.email : null) || ''}</div>
                    </div>
                  </div>
                ))}
              </React.Fragment>
            ))
          )}
        </div>
      </div>

      {/* right column — detail */}
      {selected ? (
        <div className="cdetail scroll" key={selected.id}>
          <div
            className="cdetail__av fadein"
            style={{ background: avatarColor(selected.display_name || selected.email) }}
          >
            {getInitials(selected.display_name || selected.email || '')}
          </div>
          <div className="cdetail__name">{selected.display_name || selected.email}</div>
          {selected.title && <div className="cdetail__role">{selected.title}</div>}
          {selected.organization && <div className="cdetail__role">{selected.organization}</div>}
          <div className="cdetail__actions">
            {(selected.email || selected.emails?.length > 0) && (
              <button
                className="act act--primary"
                onClick={() => handleComposeToContact(selected)}
              >
                <IconMail size={15} /> {t('contacts.fieldEmail')}
              </button>
            )}
            {selected.phones?.[0] && (
              <button
                className="act"
                onClick={() => window.api.shell.openExternal(`tel:${selected.phones[0]}`)}
              >
                <IconPhone size={15} /> {t('action.phone')}
              </button>
            )}
            <button className="act" onClick={() => setEditing(selected)}>
              <IconEdit size={15} /> {t('contacts.edit')}
            </button>
            <button className="act act--danger" onClick={() => handleDelete(selected)}>
              <IconTrash size={15} /> {t('action.delete')}
            </button>
          </div>
          <div className="cdetail__card">
            {(selected.emails || (selected.email ? [selected.email] : [])).filter(Boolean).map((email, i) => (
              <div key={i} className="cfield">
                <span className="cfield__ic"><IconMail size={17} /></span>
                <div>
                  <div className="cfield__label">{t('contacts.fieldEmail')}</div>
                  <div className="cfield__val">
                    <a href="#" onClick={ev => { ev.preventDefault(); handleComposeToContact({ ...selected, email }) }}>
                      {email}
                    </a>
                  </div>
                </div>
              </div>
            ))}
            {(selected.phones || []).map((phone, i) => (
              <div key={i} className="cfield">
                <span className="cfield__ic"><IconPhone size={17} /></span>
                <div>
                  <div className="cfield__label">{t('contacts.fieldPhone')}</div>
                  <div className="cfield__val">{phone}</div>
                </div>
              </div>
            ))}
            {selected.organization && (
              <div className="cfield">
                <span className="cfield__ic"><IconBuilding size={17} /></span>
                <div>
                  <div className="cfield__label">{t('contacts.fieldCompany')}</div>
                  <div className="cfield__val">{selected.organization}</div>
                </div>
              </div>
            )}
            {selected.birthday && (
              <div className="cfield">
                <span className="cfield__ic" style={{ fontSize: 17 }}>🎂</span>
                <div>
                  <div className="cfield__label">{t('contacts.fieldBirthday')}</div>
                  <div className="cfield__val">{formatBirthday(selected.birthday)}</div>
                </div>
              </div>
            )}
            {selected.notes && (
              <div className="cfield">
                <span className="cfield__ic"><IconPin size={17} /></span>
                <div>
                  <div className="cfield__label">{t('contacts.fieldNotes')}</div>
                  <div className="cfield__val">{selected.notes}</div>
                </div>
              </div>
            )}
            {Array.isArray(selected.social_profiles) && selected.social_profiles.map((s, i) => {
              const label = s.displayname || s.user || s.url || s.type
              const url = s.url?.startsWith('http') ? s.url : null
              return (
                <div key={i} className="cfield">
                  <span className="cfield__ic" style={{ fontSize: 17 }}>{(s.type || '?')[0].toUpperCase()}</span>
                  <div>
                    <div className="cfield__label">{s.type || 'Social'}</div>
                    <div className="cfield__val">
                      {url
                        ? <a href="#" onClick={e => { e.preventDefault(); window.api.shell.openExternal(url) }}>{label}</a>
                        : <span>{label}</span>
                      }
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)' }}>
          <div style={{ textAlign: 'center' }}>
            <IconContacts size={48} style={{ marginBottom: 14, opacity: 0.3 }} />
            <div style={{ fontSize: 13 }}>{t('contacts.selectContact')}</div>
          </div>
        </div>
      )}
      {editing && (
        <ContactEditor
          contact={editing.id ? editing : null}
          accountEmail={state.auth.email}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
