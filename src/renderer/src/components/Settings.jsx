import React from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { IconSignOut, IconGlobe } from './Icons'

export default function Settings() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const s = state.settings
  const email = state.auth.email || ''
  const initials = email.slice(0, 2).toUpperCase() || '?'

  function update(key, value) {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { [key]: value } })
    window.api.settings?.set?.({ [key]: value })
  }

  function signOut() {
    window.api.auth.deleteCredentials()
    window.api.imap.disconnect()
    dispatch({ type: 'SET_UNAUTHENTICATED' })
  }

  const Switch = ({ on, onChange }) => (
    <button className={`switch${on ? ' on' : ''}`} onClick={onChange} type="button" />
  )

  const SegSm = ({ value, options, onChange }) => (
    <div className="segsm">
      {options.map(([v, l]) => (
        <button key={v} className={value === v ? 'active' : ''} onClick={() => onChange(v)} type="button">
          {l}
        </button>
      ))}
    </div>
  )

  const ACCENTS = ['#0071e3', '#5e5ebc', '#1f9d57', '#e0820b', '#e5484d']

  return (
    <div className="full">
      <div className="settings scroll">
        <div className="settings__inner">
          <div className="settings__title">Impostazioni</div>
          <div className="settings__sub">Personalizza l'aspetto e il comportamento di Kumo</div>

          {/* Aspetto */}
          <div className="sset">
            <div className="sset__label">Aspetto</div>
            <div className="sset__card">
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">Tema</div>
                  <div className="srow__desc">Chiaro o scuro</div>
                </div>
                <SegSm
                  value={s.theme === 'dark' ? 'dark' : 'light'}
                  options={[['light', 'Chiaro'], ['dark', 'Scuro']]}
                  onChange={v => update('theme', v)}
                />
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">Colore accento</div>
                  <div className="srow__desc">Tinta dei pulsanti e degli elementi attivi</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ACCENTS.map(c => (
                    <button
                      key={c}
                      type="button"
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
                  <div className="srow__name">Densità elenco</div>
                  <div className="srow__desc">Quante email mostrare a schermo</div>
                </div>
                <SegSm
                  value={s.displayDensity === 'comfortable' ? 'comfortable' : 'compact'}
                  options={[['compact', 'Compatta'], ['comfortable', 'Comoda']]}
                  onChange={v => update('displayDensity', v)}
                />
              </div>
            </div>
          </div>

          {/* Stile elenco */}
          <div className="sset">
            <div className="sset__label">Stile elenco email</div>
            <div className="sset__card">
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">Mostra avatar</div>
                  <div className="srow__desc">Iniziali colorate accanto a ogni messaggio</div>
                </div>
                <Switch on={s.showAvatars !== false} onChange={() => update('showAvatars', !(s.showAvatars !== false))} />
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">Anteprima testo</div>
                  <div className="srow__desc">Riga di anteprima del contenuto</div>
                </div>
                <Switch on={s.showPreview !== false} onChange={() => update('showPreview', !(s.showPreview !== false))} />
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className="sset">
            <div className="sset__label">Privacy e notifiche</div>
            <div className="sset__card">
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">Blocca immagini remote</div>
                  <div className="srow__desc">Impedisce il caricamento di pixel di tracciamento</div>
                </div>
                <Switch on={s.blockRemoteImages !== false} onChange={() => update('blockRemoteImages', !s.blockRemoteImages)} />
              </div>
              <div className="srow">
                <div className="srow__txt">
                  <div className="srow__name">Notifiche nuovi messaggi</div>
                  <div className="srow__desc">Mostra notifiche Windows per la nuova posta</div>
                </div>
                <Switch on={s.notificationsEnabled !== false} onChange={() => update('notificationsEnabled', !s.notificationsEnabled)} />
              </div>
            </div>
          </div>

          {/* Account */}
          <div className="sset">
            <div className="sset__label">Account</div>
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
                  <IconSignOut size={15} /> Esci
                </button>
              </div>
              <div className="srow">
                <span style={{ color: 'var(--ink-3)' }}><IconGlobe size={17} /></span>
                <div className="srow__txt">
                  <div className="srow__name">Lingua</div>
                  <div className="srow__desc">Lingua dell'interfaccia</div>
                </div>
                <div className="srow__name" style={{ color: 'var(--ink-2)' }}>Italiano</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
