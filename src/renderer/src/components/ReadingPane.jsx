import React, { useEffect, useState, useRef } from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import { useTranslation } from '../i18n/index'
import {
  IconReply, IconReplyAll, IconForward, IconStar, IconMarkRead,
  IconTrash, IconNoSymbol, IconEnvelope, IconArchive,
  IconFileImage, IconFileDoc, IconDownload, IconClose
} from './Icons'

const AVATAR_COLORS = [
  '#0071e3','#5e5ebc','#bf5af2','#ff6b35',
  '#30d158','#ffd60a','#ff453a','#64d2ff'
]

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name, email) {
  if (name) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
      return ([...parts[0]][0] + [...parts[parts.length - 1]][0]).toUpperCase()
    }
    return [...parts[0]].slice(0, 2).join('').toUpperCase()
  }
  return [...(email || '?')].slice(0, 2).join('').toUpperCase()
}

const ADDR_COLORS = [
  '#0071e3','#5e5ebc','#bf5af2','#ff6b35',
  '#30d158','#ffd60a','#ff453a','#64d2ff'
]

function addrColor(name) {
  if (!name) return ADDR_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return ADDR_COLORS[Math.abs(h) % ADDR_COLORS.length]
}

function EmailBodyContextMenu({ isVisible, position, selectedText, selectedLink, onClose, onAction }) {
  const menuRef = useRef(null)
  const t = useTranslation()

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

  return (
    <div
      ref={menuRef}
      className="email-context-menu"
      style={{
        position: 'fixed',
        left: Math.max(10, adjustedPosition.x),
        top: Math.max(10, adjustedPosition.y),
        zIndex: 1000
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
    </div>
  )
}

function formatFullDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function attachIconColor(att) {
  const name = (att.filename || att.name || '').toLowerCase()
  const type = (att.type || '').toLowerCase()
  if (type === 'application/pdf' || name.endsWith('.pdf')) return '#e5484d'
  if (type.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|bmp)$/.test(name)) return '#30a46c'
  if (/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$/.test(name)) return '#0071e3'
  return '#565c69'
}

function isImageFile(att) {
  const name = (att.filename || att.name || '').toLowerCase()
  return /\.(jpe?g|png|gif|webp)$/.test(name)
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1048576).toFixed(1) + 'MB'
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

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #1d1d1f;
    background: #ffffff;
    margin: 0;
    padding: 20px 24px;
    word-break: break-word;
    overflow-x: hidden;
  }
  a { color: #0071e3; }
  img { max-width: 100%; height: auto; display: block; }
  img[data-blocked] { display: none !important; }
  pre { white-space: pre-wrap; background: #f5f5f7; padding: 12px; border-radius: 8px; font-size: 13px; }
  blockquote { border-left: 3px solid #d2d2d7; margin: 8px 0 8px 8px; padding-left: 12px; color: #6e6e73; }
  table { border-collapse: collapse; max-width: 100%; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.18); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.32); }
</style>
</head>
<body>${renderHtml}<script>${bridgeScript}</script></body>
</html>`
}

export default function ReadingPane() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const msg = state.messages.selected
  const [body, setBody] = useState(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [attachmentMeta, setAttachmentMeta] = useState([])
  const [imagesBlocked, setImagesBlocked] = useState(state.settings.blockRemoteImages)
  const [imagesLoadedByUser, setImagesLoadedByUser] = useState(false)
  const [filePreview, setFilePreview] = useState(null)   // { src, filename, isPdf, localPath }
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
    if (!msg) { setBody(null); setAttachmentMeta([]); return }
    if (!msg.folder) { setBodyLoading(false); return }  // guard: no IMAP calls without a folder
    setBody(null)
    setAttachmentMeta([])
    setBodyLoading(true)
    setImagesLoadedByUser(false)
    setImagesBlocked(state.settings.blockRemoteImages)
    dispatch({ type: 'SET_LOADING', payload: t('loading.email') })

    Promise.all([
      window.api.imap.fetchBody(msg.folder, msg.uid),
      window.api.imap.getAttachmentMeta(msg.uid, msg.folder)
    ]).then(([bodyResult, metaResult]) => {
      if (bodyResult.ok) setBody(bodyResult.body)
      if (metaResult.ok && metaResult.metas?.length) setAttachmentMeta(metaResult.metas)
      setBodyLoading(false)
      dispatch({ type: 'CLEAR_LOADING' })
    }).catch(() => { setBodyLoading(false); dispatch({ type: 'CLEAR_LOADING' }) })
  }, [msg?.uid, msg?.folder])

  useEffect(() => {
    function handleIframeMessage(event) {
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
            const target = plainContent
            navigator.clipboard.writeText(target.textContent || target.innerText || '')
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
        const target = plainContent

        if (target) {
          const range = document.createRange()
          range.selectNodeContents(target)
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


  function handleReply() {
    window.api.window.openCompose({ mode: 'reply', message: msg, body })
  }
  function handleReplyAll() {
    window.api.window.openCompose({ mode: 'replyAll', message: msg, body })
  }
  function handleForward() {
    window.api.window.openCompose({ mode: 'forward', message: msg, body })
  }

  function handleDelete() {
    if (!msg || !msg.folder) return
    dispatch({ type: 'REMOVE_MESSAGE', payload: { uid: msg.uid, folder: msg.folder } })
    window.api.imap.deleteMessage(msg.folder, msg.uid, false, state.auth.email)
  }

  function handleArchive() {
    if (!msg || !msg.folder) return
    dispatch({ type: 'REMOVE_MESSAGE', payload: { uid: msg.uid, folder: msg.folder } })
    window.api.imap.archiveMessage?.(msg.folder, msg.uid)
  }

  function handleToggleStar() {
    if (!msg) return
    const isStarred = msg.flags?.includes('\\Flagged')
    const newFlags = isStarred
      ? msg.flags.filter(f => f !== '\\Flagged')
      : [...(msg.flags || []), '\\Flagged']
    dispatch({ type: 'UPDATE_MESSAGE_FLAGS', payload: { uid: msg.uid, folder: msg.folder, flags: newFlags } })
    if (msg.folder) window.api.imap.starMessage(msg.folder, msg.uid, !isStarred, state.auth.email)
  }

  function handleToggleRead() {
    if (!msg) return
    const isRead = msg.flags?.includes('\\Seen')
    const newFlags = isRead
      ? msg.flags.filter(f => f !== '\\Seen')
      : [...(msg.flags || []), '\\Seen']
    dispatch({ type: 'UPDATE_MESSAGE_FLAGS', payload: { uid: msg.uid, folder: msg.folder, flags: newFlags } })
    if (msg.folder) window.api.imap.markRead(msg.folder, msg.uid, !isRead, state.auth.email)
  }

  function handleMarkJunk() {
    if (!msg || !msg.folder) return
    dispatch({ type: 'REMOVE_MESSAGE', payload: { uid: msg.uid, folder: msg.folder } })
    window.api.imap.markJunk(msg.folder, msg.uid, true, state.auth.email)
  }

  function handleLoadImages() {
    setImagesBlocked(false)
    setImagesLoadedByUser(true)
  }

  async function handlePreviewAttachment(att, idx) {
    if (!msg || loadingIdx !== null) return
    const partId  = att.partId || String(idx + 1)
    const isImage = att.type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(att.filename || '')
    const isPdf   = att.type === 'application/pdf' || /\.pdf$/i.test(att.filename || '')
    if (!isImage && !isPdf) {
      // Non-previewable: save dialog
      await handleSaveAttachment(att, idx)
      return
    }
    setLoadingIdx(idx)
    try {
      const dlResult = await window.api.imap.downloadAttachment(
        msg.folder, msg.uid, partId, att.filename, state.auth.email
      )
      if (!dlResult.ok) { console.error('Download failed:', dlResult.error); return }
      const src = `kumo-local:///${dlResult.filePath.replace(/\\/g, '/')}`
      setFilePreview({ src, filename: att.filename, isPdf, localPath: dlResult.filePath })
    } catch (err) {
      console.error('Preview error:', err.message)
    } finally {
      setLoadingIdx(null)
    }
  }

  async function handleSaveAttachment(att, idx) {
    if (!msg) return
    const partId = att.partId || String(idx + 1)
    try {
      const dlResult = await window.api.imap.downloadAttachment(
        msg.folder, msg.uid, partId, att.filename, state.auth.email
      )
      if (dlResult.ok) {
        await window.api.dialog.saveFile(dlResult.filePath, att.filename)
      }
    } catch (err) {
      console.error('Save error:', err.message)
    }
  }

  if (!msg) {
    return (
      <div className="reader">
        <div className="reader__empty">
          <div className="reader__empty-mark">
            <IconEnvelope size={30} />
          </div>
          <h3>{t('reading.noMessage')}</h3>
          <p>{t('reading.noMessageDesc')} {t('reading.navigate')}</p>
        </div>
      </div>
    )
  }

  const isRead = msg.flags?.includes('\\Seen')
  const isStarred = msg.flags?.includes('\\Flagged')
  const textContent = body?.text || ''

  // Sender info
  const senderName = msg.from_name || ''
  const senderEmail = msg.from_email || ''

  // Recipient names from to_addresses
  const recipientNames = (msg.to_addresses || [])
    .map(a => (typeof a === 'string' ? a : (a.name || a.email || '')))
    .filter(Boolean)
    .join(', ') || ''

  // Build attachment list: DB metadata is the source of truth (from bodyStructure),
  // supplemented by partId/type from simpleParser when available
  const parsedAtts = body?.attachments || []
  const attachments = (() => {
    if (attachmentMeta.length > 0) {
      return attachmentMeta
        .filter(m => !m.is_inline || m.filename)  // skip inline images with no filename
        .map(m => {
          const parsed = parsedAtts.find(a => a.partId === m.part_id || a.filename === m.filename)
          return {
            filename: m.filename || 'attachment',
            size: m.size || parsed?.size || 0,
            type: m.content_type || parsed?.type || 'application/octet-stream',
            partId: m.part_id
          }
        })
    }
    return parsedAtts
  })()

  const hasRemoteImages = !!(body?.html && /src=["']https?:\/\//i.test(body.html))

  const renderHtml = body?.html
    ? buildSafeHTML(body.html, imagesBlocked && !imagesLoadedByUser)
    : null

  const iframeDoc = renderHtml ? buildEmailIframeDoc(renderHtml) : null

  return (
    <div className="reader" key={msg.uid}>
      {filePreview && (
        <div
          className="image-preview-overlay"
          onClick={() => setFilePreview(null)}
          onKeyDown={e => e.key === 'Escape' && setFilePreview(null)}
          role="dialog"
          aria-label={t('reading.imagePreview')}
        >
          <div className="image-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="image-preview-modal__header">
              <span className="truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{filePreview.filename}</span>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button
                  className="btn btn--ghost"
                  style={{ fontSize: 'var(--text-sm)' }}
                  onClick={() => window.api.dialog.saveFile(filePreview.localPath, filePreview.filename)}
                >
                  <IconDownload size={14} />
                </button>
                <button className="btn btn--icon" onClick={() => setFilePreview(null)} title={t('action.close')}>
                  <IconClose size={16} />
                </button>
              </div>
            </div>
            <div className="image-preview-modal__body">
              {filePreview.isPdf ? (
                <iframe
                  src={filePreview.src}
                  title={filePreview.filename}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: 'var(--radius-md)' }}
                />
              ) : (
                <img src={filePreview.src} alt={filePreview.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="reader__head fadein">
        <div className="reader__subject">{msg.subject || t('reading.noSubject')}</div>
        <div className="reader__metarow">
          <div className="reader__sender-av" style={{ background: getAvatarColor(senderName) }}>
            {getInitials(senderName, senderEmail)}
          </div>
          <div className="reader__sender">
            <div className="reader__sender-name">
              {senderName}{' '}
              <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: '12.5px' }}>
                {'<'}{senderEmail}{'>'}
              </span>
            </div>
            <div className="reader__sender-detail">
              a <b>{recipientNames}</b>
            </div>
          </div>
          <div className="reader__date">{formatFullDate(msg.date)}</div>
        </div>
      </div>

      {/* Action toolbar */}
      <div className="reader__bar">
        <button className="act act--primary" onClick={handleReply}>
          <IconReply size={15} /> {t('action.reply')} <kbd>R</kbd>
        </button>
        <button className="act" onClick={handleReplyAll}>
          <IconReplyAll size={15} /> {t('action.all')}
        </button>
        <button className="act" onClick={handleForward}>
          <IconForward size={15} /> {t('action.forward')}
        </button>
        <div className="reader__bar-sep" />
        <button className={`icon-btn${isStarred ? ' on' : ''}`} title={isStarred ? t('action.unstar') : t('action.star')} onClick={handleToggleStar}>
          <IconStar size={17} fill={isStarred ? 'currentColor' : 'none'} />
        </button>
        <button className="icon-btn" title={isRead ? t('action.markUnread') : t('action.markRead')} onClick={handleToggleRead}>
          <IconMarkRead size={17} />
        </button>
        <button className="icon-btn" title={t('action.markJunk')} onClick={handleMarkJunk}>
          <IconNoSymbol size={17} />
        </button>
        <button className="icon-btn" title={t('action.archive')} onClick={handleArchive}>
          <IconArchive size={17} />
        </button>
        <button className="icon-btn" title={t('action.delete')} onClick={handleDelete}>
          <IconTrash size={17} />
        </button>
      </div>

      {/* Remote images banner */}
      {hasRemoteImages && imagesBlocked && !imagesLoadedByUser && (
        <div className="banner">
          <span>{t('reading.imagesBlocked')}</span>
          <button onClick={handleLoadImages}>{t('action.loadImages')}</button>
        </div>
      )}

      {/* Email body — iframe UNCHANGED */}
      <div className="reader__body scroll">
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
        ) : textContent ? (
          <div
            className="reading-pane__plain-text"
            style={{
              userSelect: 'text',
              cursor: 'text'
            }}
            onContextMenu={handleContextMenu}
          >
            {textContent}
          </div>
        ) : (
          <div style={{ padding: 'var(--sp-5)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            {t('reading.noContent')}
          </div>
        )}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="attach">
          {attachments.map((att, i) => (
            <div key={i} className="attach__chip" onClick={() => handlePreviewAttachment(att, i)}>
              <div className="attach__ic" style={{ background: attachIconColor(att) }}>
                {isImageFile(att) ? <IconFileImage size={17} /> : <IconFileDoc size={17} />}
              </div>
              <div>
                <div className="attach__name">{att.filename || att.name}</div>
                <div className="attach__size">{formatSize(att.size)}</div>
              </div>
              <button className="icon-btn" title="Scarica" onClick={ev => { ev.stopPropagation(); handleSaveAttachment(att, i) }}>
                <IconDownload size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <EmailBodyContextMenu
        isVisible={contextMenu.isVisible}
        position={contextMenu.position}
        selectedText={contextMenu.selectedText}
        selectedLink={contextMenu.selectedLink}
        onClose={() => setContextMenu({ ...contextMenu, isVisible: false })}
        onAction={handleContextMenuAction}
      />
    </div>
  )
}
