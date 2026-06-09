import React, { useEffect, useState } from 'react'

const AVATAR_COLORS = [
  '#0071e3', '#5e5ebc', '#bf5af2', '#ff6b35',
  '#30d158', '#ffd60a', '#ff453a', '#64d2ff'
]

export function getAvatarColor(name = '') {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let index = 0; index < name.length; index++) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getInitials(name, email) {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return (`${[...parts[0]][0]}${[...parts[parts.length - 1]][0]}`).toUpperCase()
    }
    if (parts[0]) return [...parts[0]].slice(0, 2).join('').toUpperCase()
  }
  return [...(email || '?')].slice(0, 2).join('').toUpperCase()
}

export function isOutgoingFolder(folder) {
  const specialUse = String(folder?.special_use || folder?.specialUse || '').toLowerCase()
  if (['\\sent', '\\drafts', '\\outbox'].includes(specialUse)) return true
  return /(^|[\/._ -])(sent|drafts?|outbox|posta inviata|bozze)([\/._ -]|$)/i.test(
    String(folder?.path || folder?.name || folder || '')
  )
}

export default function SenderAvatar({
  className,
  name,
  email,
  folder,
  enabled = false,
  fallback,
  style,
  title
}) {
  const [logo, setLogo] = useState(null)
  const excluded = isOutgoingFolder(folder)

  useEffect(() => {
    let active = true
    setLogo(null)
    if (!enabled || excluded || !email || !window.api?.senderLogo?.get) {
      return () => { active = false }
    }

    window.api.senderLogo.get(email, folder)
      .then(result => {
        if (active && result?.ok && /^data:image\//i.test(result.dataUrl || '')) {
          setLogo({ dataUrl: result.dataUrl, source: result.source })
        }
      })
      .catch(() => {})

    return () => { active = false }
  }, [email, enabled, excluded, folder?.path, folder?.special_use])

  const initials = fallback ?? getInitials(name, email)
  return (
    <div
      className={className}
      style={{ background: getAvatarColor(name || email), ...style }}
      title={title}
      data-logo-source={logo?.source || undefined}
    >
      {logo
        ? <img className="sender-avatar__image" src={logo.dataUrl} alt="" draggable="false" />
        : initials}
    </div>
  )
}
