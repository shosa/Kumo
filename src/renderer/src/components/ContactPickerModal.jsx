import React, { useState, useEffect, useRef } from 'react'
import { IconSearch, IconClose, IconContacts } from './Icons'

const AVATAR_COLORS = [
  '#0071e3','#5e5ebc','#bf5af2','#ff6b35',
  '#30d158','#ffd60a','#ff453a','#64d2ff'
]

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name, email) {
  if (name) {
    const parts = name.trim().split(' ').filter(Boolean)
    if (parts.length >= 2) return ([...parts[0]][0] + [...parts[parts.length - 1]][0]).toUpperCase()
    return [...parts[0]].slice(0, 2).join('').toUpperCase()
  }
  return [...(email || '?')].slice(0, 2).join('').toUpperCase()
}

export default function ContactPickerModal({ contacts, onAdd, onClose, showCcBcc }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const searchRef = useRef(null)

  useEffect(() => { searchRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = (contacts || []).filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (c.display_name || '').toLowerCase().includes(q) ||
           (c.email || '').toLowerCase().includes(q) ||
           (c.organization || '').toLowerCase().includes(q)
  })

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(c => c.id || c.email)))
    }
  }

  function addTo(field) {
    const picks = filtered.filter(c => selected.has(c.id || c.email))
    if (!picks.length) return
    onAdd(picks, field)
    onClose()
  }

  const hasSelection = selected.size > 0

  return (
    <div className="contact-picker-overlay" onClick={onClose}>
      <div className="contact-picker" onClick={e => e.stopPropagation()}>
        <div className="contact-picker__header">
          <IconContacts size={15} />
          <div className="contact-picker__search-wrap">
            <IconSearch size={13} />
            <input
              ref={searchRef}
              className="contact-picker__search"
              placeholder="Cerca contatti…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="contact-picker__clear" onClick={() => setSearch('')}>
                <IconClose size={11} />
              </button>
            )}
          </div>
          <button className="btn btn--icon" style={{ width: 26, height: 26 }} onClick={onClose}>
            <IconClose size={14} />
          </button>
        </div>

        {filtered.length > 0 && (
          <div className="contact-picker__select-all" onClick={toggleAll}>
            <input
              type="checkbox"
              readOnly
              checked={selected.size > 0 && selected.size === filtered.length}
              ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length }}
            />
            <span>{selected.size > 0 ? `${selected.size} selezionati` : 'Seleziona tutti'}</span>
          </div>
        )}

        <div className="contact-picker__list">
          {filtered.length === 0 ? (
            <div className="contact-picker__empty">Nessun contatto trovato</div>
          ) : filtered.map(c => {
            const id = c.id || c.email
            const isSelected = selected.has(id)
            const bg = avatarColor(c.display_name || c.email)
            const ini = initials(c.display_name, c.email)
            return (
              <div
                key={id}
                className={`contact-picker__item${isSelected ? ' selected' : ''}`}
                onClick={() => toggle(id)}
              >
                <input type="checkbox" readOnly checked={isSelected} tabIndex={-1} />
                <div className="contact-picker__avatar" style={{ background: bg }}>{ini}</div>
                <div className="contact-picker__info">
                  <div className="contact-picker__name">{c.display_name || c.email}</div>
                  {c.display_name && <div className="contact-picker__email">{c.email}</div>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="contact-picker__footer">
          <span className="contact-picker__footer-label">Aggiungi a:</span>
          <button className="btn btn--ghost contact-picker__add-btn" disabled={!hasSelection} onClick={() => addTo('to')}>A</button>
          <button className="btn btn--ghost contact-picker__add-btn" disabled={!hasSelection} onClick={() => addTo('cc')}>CC</button>
          <button className="btn btn--ghost contact-picker__add-btn" disabled={!hasSelection} onClick={() => addTo('bcc')}>CCN</button>
        </div>
      </div>
    </div>
  )
}
