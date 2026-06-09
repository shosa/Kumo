import React, { useEffect, useState } from 'react'
import { useTranslation } from '../i18n'

export default function UndoSendToast() {
  const t = useTranslation()
  const [pending, setPending] = useState(null)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    return window.api.on('smtp:undo-window', data => {
      setPending(data)
      setRemaining(Math.max(0, data.undoSeconds || 0))
    })
  }, [])

  useEffect(() => {
    if (!pending) return undefined
    const tick = setInterval(() => {
      const next = Math.max(0, Math.ceil((pending.sendAfter - Date.now()) / 1000))
      setRemaining(next)
      if (next <= 0) setPending(null)
    }, 250)
    return () => clearInterval(tick)
  }, [pending])

  async function undo() {
    const result = await window.api.smtp.cancelSend(pending.outboxId)
    if (result.ok) setPending(null)
  }

  if (!pending) return null

  return (
    <div className="undo-send" role="status">
      <div className="undo-send__copy">
        <strong>{t('send.queued')}</strong>
        <span>{pending.subject || t('reading.noSubject')}</span>
      </div>
      <div className="undo-send__timer">{remaining}s</div>
      <button className="act act--primary" onClick={undo}>{t('send.undo')}</button>
    </div>
  )
}
