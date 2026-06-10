import React, { useState, useEffect, useRef } from 'react'
import { locales } from '../i18n/index'
import RichTextEditor from './RichTextEditor'
import ContactPickerModal from './ContactPickerModal'
import QuotedMessagePreview from './QuotedMessagePreview'
import { useAppearance } from '../appearance'
import { buildQuotedMessage, combineComposeHtml } from '../composeReply'
import { buildSignatureBlock } from '../signatureHtml'
import {
  IconClose, IconAttach, IconSend, IconContacts
} from './Icons'

function buildReplySubject(mode, subject) {
  if (!subject) return mode === 'forward' ? 'Fwd: ' : 'Re: '
  if (mode === 'forward') return subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`
  return subject.startsWith('Re:') ? subject : `Re: ${subject}`
}

function buildReplyTo(mode, msg, selfEmail) {
  if (mode === 'reply') return msg.from_email || ''
  if (mode === 'replyAll') {
    const all = [msg.from_email, ...(msg.to_addresses || []).map(a => a.email)].filter(Boolean)
    return [...new Set(all)]
      .filter(e => e.toLowerCase() !== (selfEmail || '').toLowerCase())
      .join(', ')
  }
  return ''
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())
}

function parseAddressString(input) {
  if (!input || typeof input !== 'string') return []
  const addresses = []
  const parts = input.split(/[,;](?![^<]*>)/).map(s => s.trim()).filter(Boolean)
  for (const part of parts) {
    const named = part.match(/^(.+?)\s*<([^>]+)>$/)
    if (named) {
      const name = named[1].trim().replace(/^["']|["']$/g, '')
      const email = named[2].trim()
      addresses.push({ name, address: email, isValid: isValidEmail(email) })
    } else {
      addresses.push({ name: '', address: part.trim(), isValid: isValidEmail(part.trim()) })
    }
  }
  return addresses
}

function formatAddresses(addresses) {
  return (addresses || []).map(a => a.name ? `${a.name} <${a.address}>` : a.address).join(', ')
}

function AddressChip({ address, onRemove, removeLabel }) {
  return (
    <span className={`address-chip${!address.isValid ? ' address-chip--invalid' : ''}`}>
      <span className="address-chip__text">
        {address.name ? `${address.name} <${address.address}>` : address.address}
      </span>
      <button className="address-chip__remove" onClick={onRemove} type="button" aria-label={removeLabel}>×</button>
    </span>
  )
}

function RecipientField({ label, addresses, onChange, placeholder, trailing, contacts, removeLabel }) {
  const [suggestions, setSuggestions] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    const query = inputValue.trim()
    if (!query || query.length < 2 || !focused) { setSuggestions([]); return }
    const lower = query.toLowerCase()
    const matches = (contacts || []).filter(c =>
      (c.display_name || '').toLowerCase().includes(lower) ||
      (c.email || '').toLowerCase().includes(lower)
    ).slice(0, 6)
    setSuggestions(matches)
  }, [inputValue, focused, contacts])

  useEffect(() => {
    function close(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setSuggestions([])
        parseAndAdd()
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [inputValue])

  function parseAndAdd() {
    if (!inputValue.trim()) return
    const newAddrs = parseAddressString(inputValue)
    if (newAddrs.length) { onChange([...addresses, ...newAddrs]); setInputValue(''); setSuggestions([]) }
  }

  function pickContact(contact) {
    onChange([...addresses, { name: contact.display_name || '', address: contact.email, isValid: true }])
    setInputValue('')
    setSuggestions([])
  }

  function handleKeyDown(e) {
    if (['Enter', 'Tab', ',', ';'].includes(e.key)) {
      e.preventDefault()
      parseAndAdd()
    } else if (e.key === 'Backspace' && !inputValue && addresses.length > 0) {
      onChange(addresses.slice(0, -1))
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const text = (e.clipboardData || window.clipboardData).getData('text')
    const newAddrs = parseAddressString(text)
    if (newAddrs.length) onChange([...addresses, ...newAddrs])
  }

  return (
    <div className="compose-field" ref={wrapRef} style={{ position: 'relative' }}>
      <span className="compose-field__label">{label}</span>
      <div className="compose-field__chip-input">
        {addresses.map((addr, i) => (
          <AddressChip key={i} address={addr} removeLabel={removeLabel} onRemove={() => onChange(addresses.filter((_, j) => j !== i))} />
        ))}
        <input
          className="compose-field__input"
          placeholder={addresses.length === 0 ? placeholder : ''}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          autoComplete="off"
          style={{ border: 'none', outline: 'none', flex: 1, minWidth: '120px' }}
        />
      </div>
      {trailing}
      {suggestions.length > 0 && (
        <div className="compose-autocomplete">
          {suggestions.map((c, i) => (
            <div key={i} className="compose-autocomplete__item" onMouseDown={() => pickContact(c)}>
              <span className="compose-autocomplete__name">{c.display_name || c.email}</span>
              {c.display_name && c.email && <span className="compose-autocomplete__email">{c.email}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ComposeViewerApp({ composeData }) {
  const { mode = 'new', message: msg, body, to: initialTo = '', draft = null } = composeData || {}

  const [settings, setSettings] = useState({ theme: 'light', signature: '', language: 'en-US' })
  const [contacts, setContacts] = useState([])
  const [accountEmail, setAccountEmail] = useState('')
  const [to, setTo] = useState(() => parseAddressString(draft?.to_field || initialTo || (msg && mode !== 'new' ? buildReplyTo(mode, msg, '') : '')))
  const [cc, setCc] = useState(() => parseAddressString(draft?.cc_field || ''))
  const [bcc, setBcc] = useState(() => parseAddressString(draft?.bcc_field || ''))
  const [subject, setSubject] = useState(draft?.subject || (msg && mode !== 'new' ? buildReplySubject(mode, msg.subject) : ''))
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [attachments, setAttachments] = useState(draft?.attachments || [])
  const [draftId, setDraftId] = useState(draft?.id || null)
  const [bodyVersion, setBodyVersion] = useState(0)
  const [contextMenu, setContextMenu] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const draftTimer = useRef(null)
  const editorRef = useRef(null)

  function handlePickerAdd(picks, field) {
    const newAddrs = picks.map(c => ({ name: c.display_name || '', address: c.email, isValid: true }))
    const setters = { to: setTo, cc: setCc, bcc: setBcc }
    setters[field](prev => [...prev, ...newAddrs])
    if (field === 'cc' || field === 'bcc') setShowCcBcc(true)
  }

  useEffect(() => {
    window.api.settings.get().then(r => {
      if (r.ok) setSettings(r.settings)
    })
    window.api.auth.getCredentials().then(r => {
      if (r.ok && r.creds) {
        const email = r.creds.email
        setAccountEmail(email)
        if (msg && mode === 'replyAll') setTo(parseAddressString(buildReplyTo(mode, msg, email)))
        window.api.contacts.list(email).then(res => {
          if (res.ok) setContacts((res.contacts || []).filter(c => c.email && c.email.includes('@')))
        })
      }
    })
  }, [])

  useAppearance(settings)

  const [editorContent, setEditorContent] = useState('')
  const locale = locales[settings.language] || locales['en-US']
  const t = (key, ...args) => {
    let text = (locale || locales['en-US'])[key] ?? locales['en-US'][key] ?? key
    args.forEach((arg, index) => {
      text = text.replace(`{${index}}`, String(arg))
    })
    return text
  }
  const quotedHtml = mode === 'draft' ? '' : buildQuotedMessage(mode, msg, body || msg?.body, {
    locale: settings.language,
    translate: t
  })

  // Quill configuration completa come Outlook
  const quillModules = {
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'font': [] }, { 'size': ['small', false, 'large', 'huge'] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'align': [] }],
        ['blockquote', 'code-block'],
        ['link', 'image', 'video'],
        ['clean']
      ]
    },
    clipboard: {
      matchVisual: false
    }
  }

  useEffect(() => {
    if (mode === 'draft' && draft) {
      setEditorContent(draft.body_html || '<p></p>')
      return
    }
    setEditorContent(buildSignatureBlock(settings.signature))
  }, [mode, msg, settings.signature, draft])

  async function handleAttachFiles() {
    const result = await window.api.dialog.pickFiles()
    if (result.ok && result.files.length) {
      setAttachments(prev => [...prev, ...result.files])
    }
  }

  function removeAttachment(index) {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  useEffect(() => {
    if (!accountEmail) return
    clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(async () => {
      const html = combineComposeHtml(editorContent, quotedHtml)
      if (to.length === 0 && !subject && html === '<p></p>') return
      const draft = {
        id: draftId || undefined,
        account_email: accountEmail,
        subject,
        to_field: formatAddresses(to),
        cc_field: formatAddresses(cc),
        bcc_field: formatAddresses(bcc),
        body_html: html,
        in_reply_to: draft?.in_reply_to || msg?.message_id || null,
        message_refs: draft?.message_refs || msg?.message_id || null,
        attachments
      }
      const result = await window.api.drafts.save(draft)
      if (result.ok && result.id && !draftId) setDraftId(result.id)
    }, 2000)
    return () => clearTimeout(draftTimer.current)
  }, [to, cc, bcc, subject, attachments, accountEmail, bodyVersion, quotedHtml, draftId])

  async function handleSend() {
    if (to.length === 0) { setError('compose.error.noRecipient'); return }
    if (!subject.trim()) { setError('compose.error.noSubject'); return }
    if ([...to, ...cc, ...bcc].some(address => !address.isValid)) {
      setError('compose.error.invalidAddresses')
      return
    }
    setSending(true)
    setError(null)

    const editableHtml = editorRef.current?.getHTML() || editorContent || ''
    const html = combineComposeHtml(editableHtml, quotedHtml)
    const text = html.replace(/<[^>]*>/g, '') || ''

    const creds = await window.api.auth.getCredentials()
    if (!creds.ok || !creds.creds) {
      setError('compose.error.noCredentials')
      setSending(false)
      return
    }

    const fromName = creds.creds.email

    const outboxEmail = {
      accountEmail: creds.creds.email,
      to: formatAddresses(to),
      cc: cc.length ? formatAddresses(cc) : undefined,
      bcc: bcc.length ? formatAddresses(bcc) : undefined,
      subject,
      html,
      text,
      fromName,
      inReplyTo: draft?.in_reply_to || msg?.message_id || undefined,
      references: draft?.message_refs || msg?.message_id || undefined,
      attachments: attachments.map(a => ({ filename: a.name, path: a.path }))
    }

    const result = await window.api.smtp.sendOptimistic(outboxEmail)
    if (result.ok) {
      if (draftId) { window.api.drafts.delete(draftId) }
      setSent(true)
      setTimeout(() => window.close(), 1200)
    } else {
      setError(result.error || 'compose.error.failedSend')
      setSending(false)
    }
  }

  async function handleSaveDraft() {
    if (!accountEmail) return
    const editableHtml = editorRef.current?.getHTML() || editorContent || ''
    const html = combineComposeHtml(editableHtml, quotedHtml)
    const draft = {
      id: draftId || undefined,
      account_email: accountEmail,
      subject,
      to_field: formatAddresses(to),
      cc_field: formatAddresses(cc),
      bcc_field: formatAddresses(bcc),
      body_html: html,
      in_reply_to: draft?.in_reply_to || msg?.message_id || null,
      message_refs: draft?.message_refs || msg?.message_id || null,
      attachments
    }
    await window.api.drafts.save(draft)
    window.close()
  }

  function handleContextMenu(e) {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      selectedText: editorRef.current?.getSelectedText()?.trim() || ''
    })
  }

  async function handleEditorContextAction(action) {
    try {
      switch (action) {
        case 'copy':
          await editorRef.current?.copySelection()
          break
        case 'cut':
          await editorRef.current?.cutSelection()
          break
        case 'paste':
          await editorRef.current?.pasteText()
          break
        case 'selectAll':
          editorRef.current?.selectAll()
          break
        case 'clearFormatting':
          editorRef.current?.clearSelectionFormatting()
          break
        case 'attach':
          await handleAttachFiles()
          break
      }
    } catch (err) {
      console.warn('Compose context action failed:', err)
    }
    setContextMenu(null)
  }

  const placeholderText = t('compose.placeholder')

  const windowTitle = (() => {
    if (mode === 'draft') return subject || t('compose.title.new')
    if (mode === 'new') return t('compose.title.new')
    const prefix = mode === 'forward' ? 'Fwd:' : 'Re:'
    const suffix = mode === 'replyAll' ? ` ${t('compose.title.replyAll')}` : ''
    return `${prefix} ${msg?.subject || ''}${suffix}`
  })()

  return (
    <div className="viewer-window" onClick={() => setContextMenu(null)}>
      {/* Drag region with title for the native titlebar overlay area */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 150, height: 32, WebkitAppRegion: 'drag', zIndex: 9999, display: 'flex', alignItems: 'center', paddingLeft: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
          {windowTitle}
        </span>
      </div>
      <div className="compose-window compose-window--standalone">

        {showPicker && (
          <ContactPickerModal
            contacts={contacts}
            onAdd={handlePickerAdd}
            onClose={() => setShowPicker(false)}
            t={t}
          />
        )}
        <div className="compose-window__fields">
          <RecipientField
            label={t('compose.to')}
            addresses={to}
            onChange={setTo}
            placeholder={t('compose.recipientPlaceholder')}
            contacts={contacts}
            removeLabel={t('action.remove')}
            trailing={
              <>
                <button className="compose-field__icon-btn" onClick={() => setShowPicker(true)} title="Rubrica">
                  <IconContacts size={14} />
                </button>
                <button className="compose-field__cc-toggle" onClick={() => setShowCcBcc(v => !v)} title={t('compose.ccBcc')}>
                  {t('compose.ccBcc')}
                </button>
              </>
            }
          />
          {showCcBcc && (
            <>
              <RecipientField label={t('compose.cc')} addresses={cc} onChange={setCc} placeholder={t('compose.ccPlaceholder')} contacts={contacts} removeLabel={t('action.remove')} />
              <RecipientField label={t('compose.bcc')} addresses={bcc} onChange={setBcc} placeholder={t('compose.bccPlaceholder')} contacts={contacts} removeLabel={t('action.remove')} />
            </>
          )}
          <div className="compose-field">
            <span className="compose-field__label">{t('compose.subject')}</span>
            <input
              className="compose-field__input"
              placeholder={t('compose.subject')}
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
        </div>

        <div className="compose-toolbar">
          <button
            className="compose-tool-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={handleAttachFiles}
            title={t('compose.attach')}
            aria-label={t('compose.attach')}
          >
            <IconAttach size={15} />
          </button>
          <div className="compose-toolbar__spacer" />
        </div>

        <div className="compose-window__editor">
          <div className="compose-editor" onContextMenu={handleContextMenu}>
            <div className="compose-editor__content">
              <RichTextEditor
                ref={editorRef}
                value={editorContent}
                onChange={(html) => {
                  setEditorContent(html)
                  setBodyVersion(v => v + 1)
                }}
                modules={quillModules}
                placeholder={placeholderText}
              />
              <QuotedMessagePreview html={quotedHtml} title={t('compose.quote.original')} />
            </div>
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="compose-attachments">
            {attachments.map((att, i) => (
              <div key={i} className="attachment-chip">
                <span className="truncate" style={{ maxWidth: 140 }}>{att.name}</span>
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                  {att.size > 1048576 ? `${(att.size / 1048576).toFixed(1)} MB` : `${Math.round(att.size / 1024)} KB`}
                </span>
                <button className="btn btn--icon" style={{ width: 18, height: 18 }} onClick={() => removeAttachment(i)} title={t('action.close')}>
                  <IconClose size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="compose-window__footer">
          <div style={{ flex: 1 }}>
            {error && <div className="setup-error" style={{ padding: 'var(--sp-2) var(--sp-3)' }}>{t(error)}</div>}
            {sent && <div style={{ color: 'var(--color-success)', fontSize: 'var(--text-sm)' }}>{t('compose.sent')}</div>}
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button className="btn btn--ghost" onClick={handleSaveDraft}>{t('compose.saveDraft')}</button>
            <button className="btn btn--ghost" onClick={() => window.close()}>{t('compose.discard')}</button>
            <button className="btn btn--primary" onClick={handleSend} disabled={sending || sent || to.length === 0}>
              {sending ? (
                <><span className="spinner" style={{ width: 14, height: 14 }} />{t('compose.sending')}</>
              ) : (
                <><IconSend size={14} />{t('compose.send')}</>
              )}
            </button>
          </div>
        </div>
      </div>

      {contextMenu && (
        <div
          className="email-context-menu"
          onMouseLeave={() => setContextMenu(null)}
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.selectedText && (
            <button className="email-context-menu__item" onClick={() => handleEditorContextAction('copy')}>
              {t('action.copy')}
            </button>
          )}
          {contextMenu.selectedText && (
            <button className="email-context-menu__item" onClick={() => handleEditorContextAction('cut')}>
              {t('action.cut')}
            </button>
          )}
          <button className="email-context-menu__item" onClick={() => handleEditorContextAction('paste')}>
            {t('action.paste')}
          </button>
          <button className="email-context-menu__item" onClick={() => handleEditorContextAction('selectAll')}>
            {t('action.selectAll')}
          </button>
          {contextMenu.selectedText && (
            <button className="email-context-menu__item" onClick={() => handleEditorContextAction('clearFormatting')}>
              {t('action.clearFormatting')}
            </button>
          )}
          <button className="email-context-menu__item" onClick={() => handleEditorContextAction('attach')}>
            {t('compose.attach')}
          </button>
        </div>
      )}
    </div>
  )
}
