import React from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import {
  IconMail, IconContacts, IconCalendar, IconSearch, IconSettings
} from './Icons'

const AVATAR_COLORS = ['#0071e3', '#5e5ebc', '#bf5af2', '#ff6b35', '#30a46c', '#e0820b', '#e5484d', '#0e9bd6']

function avatarColor(email) {
  if (!email) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < email.length; i++) h = email.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function Rail({ onSearch }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const view = state.view || 'mail'
  const email = state.auth.email || ''
  const initials = email ? email.slice(0, 2).toUpperCase() : '?'
  const unread = state.folders.list.reduce((s, f) => s + (f.unread_count || 0), 0)

  function setView(v) { dispatch({ type: 'SET_VIEW', payload: v }) }

  const NavBtn = ({ id, Icon, label, badge }) => (
    <button
      className={`rail__btn${view === id ? ' active' : ''}`}
      title={label}
      onClick={() => setView(id)}
    >
      <Icon size={21} />
      {badge ? <span className="rail__badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  )

  return (
    <div className="rail">
      <div className="rail__mark" title="Kumo" />
      <NavBtn id="mail"     Icon={IconMail}     label="Posta"      badge={unread || null} />
      <NavBtn id="contacts" Icon={IconContacts} label="Contatti" />
      <NavBtn id="calendar" Icon={IconCalendar} label="Calendario" />
      <button className="rail__btn" title="Cerca  ⌘K" onClick={onSearch}>
        <IconSearch size={20} />
      </button>
      <div className="rail__sep" />
      <button
        className={`rail__btn${view === 'settings' ? ' active' : ''}`}
        title="Impostazioni"
        onClick={() => setView('settings')}
      >
        <IconSettings size={20} />
      </button>
      <div
        className="rail__avatar"
        title={email}
        style={{ background: `linear-gradient(150deg, ${avatarColor(email)}, #5e5ebc)` }}
        onClick={() => setView('settings')}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setView('settings')}
      >
        {initials}
      </div>
    </div>
  )
}
