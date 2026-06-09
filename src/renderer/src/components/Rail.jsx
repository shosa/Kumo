import React, { useEffect, useState } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import {
  IconMail, IconContacts, IconCalendar, IconSearch, IconSettings
} from './Icons'
import logoUrl from '../assets/icon.png'

function useTransparentLogo(src) {
  const [dataUrl, setDataUrl] = useState(null)
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = imageData.data
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 220 && d[i + 1] > 220 && d[i + 2] > 220) d[i + 3] = 0
      }
      ctx.putImageData(imageData, 0, 0)
      setDataUrl(canvas.toDataURL())
    }
    img.src = src
  }, [src])
  return dataUrl
}

const AVATAR_COLORS = ['#0071e3', '#5e5ebc', '#bf5af2', '#ff6b35', '#30a46c', '#e0820b', '#e5484d', '#0e9bd6']

function avatarColor(email) {
  if (!email) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < email.length; i++) h = email.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function RailNavButton({ id, Icon, label, badge, active, onSelect }) {
  return (
    <button
      className={`rail__btn${active ? ' active' : ''}`}
      title={label}
      onClick={() => onSelect(id)}
    >
      <Icon size={21} />
      {badge ? <span className="rail__badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  )
}

export default function Rail({ onSearch }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const view = state.view || 'mail'
  const email = state.auth.email || ''
  const initials = email ? email.slice(0, 2).toUpperCase() : '?'
  const unread = state.folders.list.reduce((s, f) => s + (f.unread_count || 0), 0)
  const logoDataUrl = useTransparentLogo(logoUrl)

  function setView(v) { dispatch({ type: 'SET_VIEW', payload: v }) }

  return (
    <div className="rail">
      <div className="rail__mark" title="Kumo">
        {logoDataUrl && <img src={logoDataUrl} alt="Kumo" className="rail__mark-logo" />}
      </div>
      <RailNavButton id="mail" Icon={IconMail} label={t('nav.mail')} badge={unread || null} active={view === 'mail'} onSelect={setView} />
      <RailNavButton id="contacts" Icon={IconContacts} label={t('nav.contacts')} active={view === 'contacts'} onSelect={setView} />
      <RailNavButton id="calendar" Icon={IconCalendar} label={t('nav.calendar')} active={view === 'calendar'} onSelect={setView} />
      <button className="rail__btn" title={t('sidebar.searchShortcut')} onClick={onSearch}>
        <IconSearch size={20} />
      </button>
      <div className="rail__sep" />
      <button
        className={`rail__btn${view === 'settings' ? ' active' : ''}`}
        title={t('sidebar.settings')}
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
