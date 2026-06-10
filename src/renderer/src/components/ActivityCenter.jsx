import React, { useCallback, useEffect, useState } from 'react'
import { useAppState } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import {
  IconSync, IconSend, IconCalendar, IconContacts, IconAttach,
  IconClock, IconTrash, IconCheck, IconJunk
} from './Icons'

const CATEGORY_ICONS = {
  sync: IconSync,
  send: IconSend,
  calendar: IconCalendar,
  contacts: IconContacts,
  attachment: IconAttach
}

export default function ActivityCenter() {
  const state = useAppState()
  const t = useTranslation()
  const [category, setCategory] = useState('all')
  const [activities, setActivities] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [listResult, metricsResult] = await Promise.all([
      window.api.activity.list(state.auth.email, category, 150),
      window.api.activity.metrics()
    ])
    if (listResult.ok) setActivities(listResult.activities)
    if (metricsResult.ok) setMetrics(metricsResult.metrics)
    setLoading(false)
  }, [state.auth.email, category])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [load])

  async function clear() {
    await window.api.activity.clear(state.auth.email)
    setActivities([])
  }

  const filters = [
    ['all', t('activity.all'), IconClock],
    ['sync', t('toolbar.sync'), IconSync],
    ['send', t('activity.send'), IconSend],
    ['calendar', t('nav.calendar'), IconCalendar],
    ['contacts', t('nav.contacts'), IconContacts],
    ['attachment', t('search.attachments'), IconAttach]
  ]

  return (
    <div className="activity-center">
      <aside className="activity-center__nav">
        <div className="activity-center__brand">
          <IconClock size={20} />
          <div><strong>{t('activity.title')}</strong><span>{t('activity.subtitle')}</span></div>
        </div>
        {filters.map(([id, label, Icon]) => (
          <button key={id} className={category === id ? 'active' : ''} onClick={() => setCategory(id)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </aside>
      <main className="activity-center__main">
        <header className="activity-center__head">
          <div>
            <h2>{t('activity.title')}</h2>
            <p>{t('activity.subtitle')}</p>
          </div>
          <button className="btn btn--ghost" onClick={clear}><IconTrash size={15} /> {t('activity.clear')}</button>
        </header>
        <div className="activity-metrics">
          <div><span>{t('activity.queued')}</span><strong>{metrics?.pendingOperations || 0}</strong></div>
          <div><span>{t('activity.messages')}</span><strong>{metrics?.storage?.messages || 0}</strong></div>
          <div><span>{t('search.attachments')}</span><strong>{metrics?.storage?.downloadedAttachments || 0}</strong></div>
        </div>
        <div className="activity-list scroll">
          {loading ? <div className="spinner" /> : activities.length === 0 ? (
            <div className="activity-empty"><IconCheck size={36} /><span>{t('activity.empty')}</span></div>
          ) : activities.map(item => {
            const Icon = item.status === 'error' ? IconJunk : (CATEGORY_ICONS[item.category] || IconClock)
            return (
              <article className={`activity-item activity-item--${item.status}`} key={item.id}>
                <span className="activity-item__icon"><Icon size={17} /></span>
                <div className="activity-item__content">
                  <strong>{item.title}</strong>
                  {item.detail && <span>{item.detail}</span>}
                </div>
                <time>{new Intl.DateTimeFormat(state.settings.language, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(item.created_at))}</time>
              </article>
            )
          })}
        </div>
      </main>
    </div>
  )
}
