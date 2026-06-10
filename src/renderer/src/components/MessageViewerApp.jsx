import React, { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  IconReply, IconReplyAll, IconForward, IconStar, IconMarkRead,
  IconTrash, IconNoSymbol, IconClose, IconAttach, IconDownload
} from './Icons'
import { locales } from '../i18n/index'
import { useAppearance } from '../appearance'
import SenderAvatar from './SenderAvatar'
import AttachmentPreviewPanel from './AttachmentPreviewPanel'
import { getPreviewableAttachmentIndexes, getAdjacentPreviewIndex } from '../attachmentNavigation'

function AddressChip({ address, large, noCompose, senderLogoEnabled = false, folder = null }) {
  const a = typeof address === 'string' ? { email: address, name: '' } : (address || {})
  const email = a.email || ''
  return (
    <div
      className={`address-chip${large ? ' address-chip--large' : ''}${noCompose ? ' address-chip--self' : ''}`}
      title={email}
      onClick={noCompose ? undefined : () => window.api.window.openCompose({ mode: 'new', to: email })}
      role={noCompose ? undefined : 'button'}
      tabIndex={noCompose ? -1 : 0}
      onKeyDown={noCompose ? undefined : e => e.key === 'Enter' && window.api.window.openCompose({ mode: 'new', to: email })}
      style={noCompose ? { cursor: 'default', pointerEvents: 'none' } : undefined}
    >
      <SenderAvatar
        className="address-chip__avatar"
        name={a.name}
        email={email}
        folder={folder}
        enabled={senderLogoEnabled}
      />
      <span className="address-chip__name">{a.name || email}</span>
      <div className="address-chip__popover">
        {a.name && <div className="address-chip__popover-name">{a.name}</div>}
        <div className="address-chip__popover-email">{email}</div>
      </div>
    </div>
  )
}

function formatFullDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function buildSafeHTML(html, blockImages) {
  let safe = html || ''
  safe = safe.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  safe = safe.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  safe = safe.replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
  if (blockImages) {
    safe = safe.replace(/<img\s/gi, '<img data-blocked="true" style="display:none" ')
    safe = safe.replace(/url\(['"]?https?:\/\/[^'")\s]+['"]?\)/gi, 'url()')
  }
  return safe
}

function buildEmailIframeDoc(renderHtml) {
  const bridgeScript = `(${function () {
    document.addEventListener('click', function (event) {
      var link = event.target && event.target.closest ? event.target.closest('a') : null
      if (!link || !/^https?:\/\//i.test(link.href)) return
      event.preventDefault()
      parent.postMessage({
        type: 'kumo-email-open-link',
        url: link.href
      }, '*')
    })

    document.addEventListener('contextmenu', function (event) {
      event.preventDefault()
      var link = event.target && event.target.closest ? event.target.closest('a') : null
      parent.postMessage({
        type: 'kumo-email-context-menu',
        x: event.clientX,
        y: event.clientY,
        selectedText: String(window.getSelection ? window.getSelection() : '').trim(),
        selectedLink: link ? link.href : '',
        allText: document.body ? (document.body.innerText || document.body.textContent || '') : ''
      }, '*')
    })

    window.addEventListener('message', function (event) {
      if (!event.data || event.data.type !== 'kumo-email-select-all') return
      var range = document.createRange()
      range.selectNodeContents(document.body)
      var selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    })
  }.toString()})()`

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#1d1d1f;background:#fff;margin:0;padding:20px 24px;word-break:break-word;overflow-x:hidden}
  a{color:#0071e3}
  img{max-width:100%;height:auto;display:block}
  img[data-blocked]{display:none!important}
  pre{white-space:pre-wrap;background:#f5f5f7;padding:12px;border-radius:8px;font-size:13px}
  blockquote{border-left:3px solid #d2d2d7;margin:8px 0 8px 8px;padding-left:12px;color:#6e6e73}
  table{border-collapse:collapse;max-width:100%}
</style></head><body>${renderHtml}<script>${bridgeScript}</script></body></html>`
}

function EmailBodyContextMenu({ isVisible, position, selectedText, selectedLink, onClose, onAction, t }) {
  const menuRef = useRef(null)

  useEffect(() => {
    if (isVisible) {
      const handleClickOutside = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target)) {
          onClose()
        }
      }
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [isVisible, onClose])

  if (!isVisible) return null

  // Adjust position if menu would go off screen
  const menuWidth = 140
  const menuHeight = selectedLink ? 120 : 60
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - menuWidth - 10),
    y: Math.min(position.y, window.innerHeight - menuHeight - 10)
  }

  return createPortal(
    <div
      ref={menuRef}
      className="email-context-menu"
      onMouseLeave={onClose}
      style={{
        position: 'fixed',
        left: Math.max(10, adjustedPosition.x),
        top: Math.max(10, adjustedPosition.y),
        zIndex: 9999
      }}
    >
      {selectedText && (
        <button onClick={() => onAction('copy')} className="email-context-menu__item">
          {t('action.copy')}
        </button>
      )}
      <button onClick={() => onAction('selectAll')} className="email-context-menu__item">
        {t('action.selectAll')}
      </button>
      {selectedLink && (
        <>
          <button onClick={() => onAction('copyLink')} className="email-context-menu__item">
            {t('action.copyLink')}
          </button>
          <button onClick={() => onAction('openLink')} className="email-context-menu__item">
            {t('action.openLink')}
          </button>
        </>
      )}
    </div>,
    document.querySelector('.app-root') || document.body
  )
}

export default function MessageViewerApp({ message }) {
  const [body, setBody] = useState(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [settings, setSettings] = useState({ theme: 'light', blockRemoteImages: true, language: 'en-US' })
  const [accountEmail, setAccountEmail] = useState(null)
  const [flags, setFlags] = useState(message?.flags || [])
  const [imagesBlocked, setImagesBlocked] = useState(true)
  const [imagesLoadedByUser, setImagesLoadedByUser] = useState(false)
  const [filePreview, setFilePreview] = useState(null)  // { src, filename, isPdf, localPath }
  const [loadingIdx, setLoadingIdx] = useState(null)
  const htmlIframeRef = useRef(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState({
    isVisible: false,
    position: { x: 0, y: 0 },
    selectedText: '',
    selectedLink: '',
    allText: ''
  })

  useEffect(() => {
    window.api.settings.get().then(r => {
      if (r.ok) {
        setSettings(r.settings)
        setImagesBlocked(r.settings.blockRemoteImages ?? true)
      }
    })
    window.api.auth.getCredentials().then(r => {
      if (r.ok && r.creds) setAccountEmail(r.creds.email)
    })
  }, [])

  useEffect(() => {
    if (!message) return undefined
    return window.api.on('sync:rollback', ({ folder, uid, flags: restoredFlags }) => {
      if (folder === message.folder && uid === message.uid && Array.isArray(restoredFlags)) {
        setFlags(restoredFlags)
      }
    })
  }, [message?.folder, message?.uid])

  useAppearance(settings)

  useEffect(() => {
    if (!message) return
    setBodyLoading(true)
    window.api.imap.fetchBody(message.folder, message.uid)
      .then(r => { if (r.ok) setBody(r.body) })
      .catch(() => {})
      .finally(() => setBodyLoading(false))
  }, [message?.folder, message?.uid])

  useEffect(() => {
    function handleIframeMessage(event) {
      if (event.source !== htmlIframeRef.current?.contentWindow) return
      if (event.data?.type === 'kumo-email-open-link') {
        window.api.shell.openExternal(event.data.url)
        return
      }
      if (event.data?.type !== 'kumo-email-context-menu') return
      const rect = htmlIframeRef.current?.getBoundingClientRect()
      setContextMenu({
        isVisible: true,
        position: {
          x: (rect?.left || 0) + event.data.x,
          y: (rect?.top || 0) + event.data.y
        },
        selectedText: event.data.selectedText || '',
        selectedLink: event.data.selectedLink || '',
        allText: event.data.allText || ''
      })
    }

    window.addEventListener('message', handleIframeMessage)
    return () => window.removeEventListener('message', handleIframeMessage)
  }, [])

  const locale = locales[settings.language] || locales['en-US']
  const t = (key) => (locale || locales['en-US'])[key] ?? key

  if (!message) {
    return <div className={`app-root theme-light`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>{t('reading.noMessage')}</div>
  }

  const isRead    = flags.includes('\\Seen')
  const isStarred = flags.includes('\\Flagged')
  const attachments = body?.attachments || []
  const previewableIndexes = getPreviewableAttachmentIndexes(attachments)
  const previewPosition = filePreview ? previewableIndexes.indexOf(filePreview.index) : -1
  const previousPreviewIndex = filePreview
    ? getAdjacentPreviewIndex(previewableIndexes, filePreview.index, -1)
    : null
  const nextPreviewIndex = filePreview
    ? getAdjacentPreviewIndex(previewableIndexes, filePreview.index, 1)
    : null

  const hasRemoteImages = !!(body?.html && /src=["']https?:\/\//i.test(body.html))
  const showBlockedBanner = hasRemoteImages && imagesBlocked && !imagesLoadedByUser

  const renderHtml = body?.html
    ? buildSafeHTML(body.html, imagesBlocked && !imagesLoadedByUser)
    : null

  const iframeDoc = renderHtml ? buildEmailIframeDoc(renderHtml) : null

  async function handleToggleStar() {
    const next = !isStarred
    await window.api.imap.starMessage(message.folder, message.uid, next, accountEmail)
    setFlags(next ? [...flags, '\\Flagged'] : flags.filter(f => f !== '\\Flagged'))
  }

  async function handleToggleRead() {
    const next = !isRead
    await window.api.imap.markRead(message.folder, message.uid, next, accountEmail)
    setFlags(next ? [...flags, '\\Seen'] : flags.filter(f => f !== '\\Seen'))
  }

  async function handleDelete() {
    await window.api.imap.deleteMessage(message.folder, message.uid, false, accountEmail)
    window.close()
  }

  async function handleMarkJunk() {
    await window.api.imap.markJunk(message.folder, message.uid, true, accountEmail)
    window.close()
  }

  function openCompose(mode) {
    window.api.window.openCompose({ mode, message: { ...message, flags }, body })
  }

  async function handlePreviewAttachment(att, idx) {
    if (loadingIdx !== null) return
    const partId  = att.partId || String(idx + 1)
    const isImage = att.type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(att.filename || '')
    const isPdf   = att.type === 'application/pdf' || /\.pdf$/i.test(att.filename || '')
    if (!isImage && !isPdf) { await handleSaveAttachment(att, idx); return }
    setLoadingIdx(idx)
    try {
      const dlResult = await window.api.imap.downloadAttachment(
        message.folder, message.uid, partId, att.filename, message.account_email || ''
      )
      if (!dlResult.ok) return
      const src = `kumo-local:///${dlResult.filePath.replace(/\\/g, '/')}`
      setFilePreview({ src, filename: att.filename, isPdf, localPath: dlResult.filePath, index: idx })
    } catch { /* ignore */ } finally {
      setLoadingIdx(null)
    }
  }

  async function handleSaveAttachment(att, idx) {
    if (loadingIdx !== null) return
    const partId = att.partId || String(idx + 1)
    setLoadingIdx(idx)
    try {
      const dlResult = await window.api.imap.downloadAttachment(
        message.folder, message.uid, partId, att.filename, message.account_email || ''
      )
      if (dlResult.ok) await window.api.dialog.saveFile(dlResult.filePath, att.filename)
    } catch { /* ignore */ } finally {
      setLoadingIdx(null)
    }
  }

  // Context menu handlers
  function handleContextMenu(e) {
    // Solo prevenire il menu del browser, non la selezione
    if (e.type === 'contextmenu') {
      e.preventDefault()
    }

    const selectedText = window.getSelection()?.toString().trim() || ''
    let selectedLink = ''

    // Check if right-click was on a link
    if (e.target.tagName === 'A') {
      selectedLink = e.target.href
    } else if (e.target.closest('a')) {
      selectedLink = e.target.closest('a').href
    }

    setContextMenu({
      isVisible: true,
      position: { x: e.clientX, y: e.clientY },
      selectedText,
      selectedLink
    })
  }

  function handleContextMenuAction(action) {
    switch (action) {
      case 'copy':
        if (contextMenu.selectedText) {
          navigator.clipboard.writeText(contextMenu.selectedText)
        } else {
          // Fallback: copy all visible text if no selection
          const plainContent = document.querySelector('.reading-pane__plain-text')
          if (contextMenu.allText) {
            navigator.clipboard.writeText(contextMenu.allText)
          } else if (plainContent) {
            navigator.clipboard.writeText(plainContent.textContent || plainContent.innerText || '')
          }
        }
        break
      case 'copyLink':
        if (contextMenu.selectedLink) {
          navigator.clipboard.writeText(contextMenu.selectedLink)
        }
        break
      case 'openLink':
        if (contextMenu.selectedLink) {
          window.api.shell.openExternal(contextMenu.selectedLink)
        }
        break
      case 'selectAll':
        const plainContent = document.querySelector('.reading-pane__plain-text')
        if (plainContent) {
          const range = document.createRange()
          range.selectNodeContents(plainContent)
          const selection = window.getSelection()
          selection.removeAllRanges()
          selection.addRange(range)
        } else {
          htmlIframeRef.current?.contentWindow?.postMessage({ type: 'kumo-email-select-all' }, '*')
        }
        break
    }
    setContextMenu({ ...contextMenu, isVisible: false })
  }

  if (filePreview) {
    return (
      <div className="viewer-window">
        <div style={{ position: 'fixed', top: 0, left: 0, right: 150, height: 32, WebkitAppRegion: 'drag', zIndex: 9999, pointerEvents: 'none' }} />
        <AttachmentPreviewPanel
          preview={filePreview}
          onClose={() => setFilePreview(null)}
          onDownload={() => window.api.dialog.saveFile(filePreview.localPath, filePreview.filename)}
          onPrevious={previousPreviewIndex === null ? null : () => handlePreviewAttachment(attachments[previousPreviewIndex], previousPreviewIndex)}
          onNext={nextPreviewIndex === null ? null : () => handlePreviewAttachment(attachments[nextPreviewIndex], nextPreviewIndex)}
          position={previewPosition + 1}
          count={previewableIndexes.length}
          t={t}
          standalone
        />
      </div>
    )
  }

  return (
    <div className="viewer-window">
      {/* Drag region for native titlebar — right:150 leaves room for Win11 min/max/close */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 150, height: 32, WebkitAppRegion: 'drag', zIndex: 9999, pointerEvents: 'none' }} />
      {/* Viewer header — sits below native titlebar overlay (32px) */}
      <div className="viewer__header">
        <div className="viewer__toolbar">
          <button className="btn btn--ghost" onClick={() => openCompose('reply')} title={t('action.reply')}>
            <IconReply size={15} /> {t('action.reply')}
          </button>
          <button className="btn btn--ghost" onClick={() => openCompose('replyAll')} title={t('action.replyAll')}>
            <IconReplyAll size={15} /> {t('action.all')}
          </button>
          <button className="btn btn--ghost" onClick={() => openCompose('forward')} title={t('action.forward')}>
            <IconForward size={15} /> {t('action.forward')}
          </button>

          <div style={{ flex: 1 }} />

          <button
            className={`btn btn--icon${isStarred ? ' active' : ''}`}
            onClick={handleToggleStar}
            title={isStarred ? t('action.unstar') : t('action.star')}
          ><IconStar size={16} /></button>

          <button
            className="btn btn--icon"
            onClick={handleToggleRead}
            title={isRead ? t('action.markUnread') : t('action.markRead')}
          ><IconMarkRead size={16} /></button>

          <button
            className="btn btn--icon"
            onClick={handleMarkJunk}
            title={t('action.markJunk')}
          ><IconNoSymbol size={16} /></button>

          <button
            className="btn btn--icon btn--danger"
            onClick={handleDelete}
            title={t('action.delete')}
          ><IconTrash size={16} /></button>

          <div style={{ width: 1, background: 'var(--glass-border)', height: 20, margin: '0 4px' }} />

          <button className="btn btn--icon" onClick={() => window.close()} title={t('action.close')}>
            <IconClose size={16} />
          </button>
        </div>

        <h2 className="viewer__subject">{message.subject || t('reading.noSubject')}</h2>

        <div className="viewer__meta">
          <div className="viewer__meta-info">
            <div className="viewer__recipients">
              <span className="viewer__recipients-label">{t('reading.from')}</span>
              <div className="viewer__chips">
                <AddressChip address={{ name: message.from_name, email: message.from_email }} large
                  senderLogoEnabled={settings.showSenderLogos === true}
                  folder={{ path: message.folder, special_use: message.folder_special_use }}
                  noCompose={message.from_email?.toLowerCase() === message.account_email?.toLowerCase()} />
              </div>
            </div>
            {(message.to_addresses?.length > 0) && (
              <div className="viewer__recipients">
                <span className="viewer__recipients-label">{t('reading.to')}</span>
                <div className="viewer__chips">
                  {(message.to_addresses || []).map((a, i) => (
                    <AddressChip key={i} address={a}
                      noCompose={(a?.email || a)?.toLowerCase() === message.account_email?.toLowerCase()} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="viewer__date">{formatFullDate(message.date)}</div>
        </div>
      </div>

      {showBlockedBanner && (
        <div className="reading-pane__images-blocked">
          <span>{t('reading.imagesBlocked')}</span>
          <button
            className="btn btn--ghost"
            onClick={() => { setImagesBlocked(false); setImagesLoadedByUser(true) }}
            style={{ padding: 'var(--sp-1) var(--sp-3)', fontSize: 'var(--text-sm)' }}
          >{t('action.loadImages')}</button>
        </div>
      )}

      <div className="viewer__body">
        {bodyLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : iframeDoc ? (
          <iframe
            ref={htmlIframeRef}
            className="reading-pane__webview"
            sandbox="allow-same-origin allow-scripts allow-popups"
            srcDoc={iframeDoc}
            title="Email body"
          />
        ) : body?.text ? (
          <div
            className="reading-pane__plain-text"
            style={{
              userSelect: 'text',
              cursor: 'text'
            }}
            onContextMenu={handleContextMenu}
          >
            {body.text}
          </div>
        ) : !bodyLoading ? (
          <div style={{ padding: 'var(--sp-5)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            {t('reading.noContent')}
          </div>
        ) : null}
      </div>

      {attachments.length > 0 && (
        <div className="attachments-strip">
          {attachments.map((att, i) => {
            const isImage = att.type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(att.filename || '')
            const isPdf   = att.type === 'application/pdf' || /\.pdf$/i.test(att.filename || '')
            const canPreview = isImage || isPdf
            const kb = att.size ? (att.size > 1048576 ? `${(att.size/1048576).toFixed(1)} MB` : `${Math.round(att.size/1024)} KB`) : ''
            const loading = loadingIdx === i
            return (
              <div key={i} className={`attachment-chip${loading ? ' attachment-chip--loading' : ''}`}>
                <div
                  className="attachment-chip__body"
                  onClick={loading ? undefined : () => handlePreviewAttachment(att, i)}
                  title={att.filename}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: canPreview && !loading ? 'pointer' : 'default' }}
                >
                  {loading ? <div className="spinner spinner--sm" /> : <IconAttach size={14} />}
                  <span className="truncate" style={{ maxWidth: 180 }}>{att.filename}</span>
                  {kb && <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{kb}</span>}
                </div>
                <div className="attachment-chip__sep" />
                <button
                  className="attachment-chip__dl-btn"
                  disabled={loading}
                  onClick={e => { e.stopPropagation(); handleSaveAttachment(att, i) }}
                  title={t('action.saveFile')}
                >
                  {loading ? <span className="spinner spinner--sm" /> : <IconDownload size={13} />}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <EmailBodyContextMenu
        isVisible={contextMenu.isVisible}
        position={contextMenu.position}
        selectedText={contextMenu.selectedText}
        selectedLink={contextMenu.selectedLink}
        onClose={() => setContextMenu({ ...contextMenu, isVisible: false })}
        onAction={handleContextMenuAction}
        t={t}
      />
    </div>
  )
}
