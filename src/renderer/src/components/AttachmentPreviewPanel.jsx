import React, { useEffect, useState } from 'react'
import { IconClose, IconDownload, IconChevronLeft, IconChevronRight } from './Icons'

export default function AttachmentPreviewPanel({
  preview, onClose, onDownload, onPrevious, onNext,
  position = 1, count = 1, t, standalone = false
}) {
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && onPrevious) onPrevious()
      if (event.key === 'ArrowRight' && onNext) onNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onPrevious, onNext])

  async function handleDownload() {
    if (saving) return
    setSaving(true)
    try {
      await onDownload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`attachment-preview${standalone ? ' attachment-preview--standalone' : ''}`}>
      <div className="attachment-preview__toolbar">
        <div className="attachment-preview__identity">
          <span className="attachment-preview__name" title={preview.filename}>{preview.filename}</span>
          {count > 1 && <span className="attachment-preview__counter">{position} / {count}</span>}
        </div>
        <div className="attachment-preview__actions">
          {count > 1 && (
            <div className="attachment-preview__navigation">
              <button className="icon-btn" type="button" onClick={onPrevious} disabled={!onPrevious} title={t('attachment.previous')}>
                <IconChevronLeft size={17} />
              </button>
              <button className="icon-btn" type="button" onClick={onNext} disabled={!onNext} title={t('attachment.next')}>
                <IconChevronRight size={17} />
              </button>
            </div>
          )}
          <button
            className="act"
            type="button"
            onClick={handleDownload}
            disabled={saving}
            title={t('action.saveFile')}
          >
            {saving ? <span className="spinner spinner--sm" /> : <IconDownload size={15} />}
            <span>{t('update.download')}</span>
          </button>
          <button
            className="icon-btn"
            type="button"
            onClick={onClose}
            title={t('action.close')}
            aria-label={t('action.close')}
          >
            <IconClose size={17} />
          </button>
        </div>
      </div>
      <div className="attachment-preview__content">
        {preview.isPdf ? (
          <iframe
            className="attachment-preview__pdf"
            src={preview.src}
            title={preview.filename}
          />
        ) : (
          <img
            className="attachment-preview__image"
            src={preview.src}
            alt={preview.filename}
          />
        )}
      </div>
    </div>
  )
}
