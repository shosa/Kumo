# Kumo Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Liquid Glass × Pro-dense redesign in `src/renderer/src/` following the design handoff checklist §13.

**Architecture:** Replace all renderer CSS with prototype tokens/classes; add `Rail.jsx` and `CommandPalette.jsx`; restyle existing components to use new class names from the prototype (`.folder`, `.mail`, `.reader`, etc.); move theme/density/accent application to `document.documentElement` data attributes and CSS custom properties set on `:root`.

**Tech Stack:** React + CSS custom properties; existing `window.api`, `AppContext`, `Icons.jsx`; Electron renderer only — main/preload/IPC untouched.

**Design reference files (read-only):**
- `design_handoff_kumo_redesign/prototype/kumo/styles.css` — canonical CSS source
- `design_handoff_kumo_redesign/prototype/kumo/mail.jsx` — Rail, Sidebar, MessageList, Reader markup
- `design_handoff_kumo_redesign/prototype/kumo/aux.jsx` — Contacts, Calendar, Settings, Compose, CommandPalette markup
- `design_handoff_kumo_redesign/prototype/kumo/app.jsx` — App shell reference

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/renderer/src/styles/variables.css` | **Replace** | Light-first design tokens + dark `[data-theme]` overrides |
| `src/renderer/src/styles/components.css` | **Replace** | All component CSS from prototype (rail, sidebar, list, reader, full-views, compose, cmdk) |
| `src/renderer/src/styles/global.css` | **Modify** | Add `kbd`, scrollbar `.scroll`, `::selection`, `@keyframes` from prototype |
| `src/renderer/src/components/Icons.jsx` | **Modify** | Add missing icons: `IconPhone`, `IconBuilding`, `IconPin`, `IconGlobe`, `IconClock`, `IconChevronLeft`, `IconChevronRight`, `IconEdit`, `IconArrowDown` |
| `src/renderer/src/components/Rail.jsx` | **Create** | New 60px left-rail view switcher |
| `src/renderer/src/components/CommandPalette.jsx` | **Create** | ⌘K command palette overlay |
| `src/renderer/src/App.jsx` | **Modify** | 4-col layout, remove Toolbar, add Rail + CommandPalette, apply tokens to DOM |
| `src/renderer/src/context/AppContext.jsx` | **Modify** | Add `accentColor`, `showAvatars`, `showPreview` to settings initial state |
| `src/renderer/src/components/Sidebar.jsx` | **Modify** | New header/compose-btn/storage-footer; remove nav-tabs; adopt `.folder` class names |
| `src/renderer/src/components/MessageList.jsx` | **Modify** | New header+search+segmented+sort; `.mail` row with quick-actions; wire avatar/preview data attrs |
| `src/renderer/src/components/ReadingPane.jsx` | **Modify** | New header, `.reader__bar` toolbar absorbing old Toolbar actions, attachments |
| `src/renderer/src/components/ContactsPanel.jsx` | **Modify** | Adopt `.full`, `.contacts__list`, `.crow`, `.cdetail`, `.cfield` classes |
| `src/renderer/src/components/CalendarPanel.jsx` | **Modify** | Adopt `.cal`, `.mini`, `.cal__events`, `.ev`, `.cal__detail`, `.evd__*` classes |
| `src/renderer/src/components/Settings.jsx` | **Modify** | Adopt `.settings`, `.sset`, `.srow`, `.switch`, `.segsm`; wire new settings flags |
| `src/renderer/src/components/Toolbar.jsx` | **Delete** | Replaced by ReadingPane toolbar |

---

## Task 1: Design Tokens

**Files:**
- Replace: `src/renderer/src/styles/variables.css`

- [ ] **Step 1: Replace variables.css with new light-first tokens**

```css
/* ── Design Tokens — Kumo Redesign ──────────────────────────────────────── */
:root {
  /* accent (overrideable at runtime) */
  --accent:            #0071e3;
  --accent-ink:        #005bb8;
  --accent-soft:       color-mix(in srgb, var(--accent) 13%, transparent);
  --accent-softer:     color-mix(in srgb, var(--accent) 7%, transparent);
  --accent-glow:       color-mix(in srgb, var(--accent) 32%, transparent);
  --on-accent:         #ffffff;

  /* neutrals — LIGHT (default) */
  --desk:              #c9ccd6;
  --bg:                #eceef3;
  --bg-tint:           color-mix(in srgb, var(--accent) 4%, #eceef3);
  --surface:           #ffffff;
  --surface-2:         #f7f8fb;
  --surface-3:         #f1f2f6;
  --rail:              rgba(248, 249, 252, 0.72);
  --sidebar:           rgba(244, 246, 250, 0.66);
  --line:              rgba(17, 20, 28, 0.08);
  --line-strong:       rgba(17, 20, 28, 0.14);
  --hover:             rgba(17, 20, 28, 0.045);
  --hover-strong:      rgba(17, 20, 28, 0.08);
  --ink:               #14161d;
  --ink-2:             #565c69;
  --ink-3:             #8a909d;
  --ink-4:             #b3b8c2;

  /* shadows */
  --shadow-window:     0 32px 80px -24px rgba(15,23,42,.5), 0 0 0 1px rgba(15,23,42,.06);
  --shadow-pop:        0 12px 40px -8px rgba(15,23,42,.28), 0 0 0 1px rgba(15,23,42,.06);
  --shadow-card:       0 1px 2px rgba(15,23,42,.06), 0 6px 20px -12px rgba(15,23,42,.18);

  /* typography */
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --mono: 'SF Mono', 'Cascadia Code', ui-monospace, 'Roboto Mono', monospace;

  /* density (runtime) */
  --row-pad-y: 7px;
  --row-gap:   10px;
  --list-fs:   13px;

  /* radius */
  --r-sm:   7px;
  --r-md:   10px;
  --r-lg:   15px;
  --r-xl:   20px;
  --r-full: 999px;

  /* easing */
  --ease:        cubic-bezier(0.32, 0.72, 0, 1);
  --ease-spring: cubic-bezier(0.34, 1.4, 0.5, 1);

  /* title bar */
  --titlebar-height: 32px;
}

/* dark theme */
[data-theme="dark"] {
  --desk:          #050608;
  --bg:            #0e1014;
  --bg-tint:       color-mix(in srgb, var(--accent) 9%, #0e1014);
  --surface:       #16181f;
  --surface-2:     #1b1e26;
  --surface-3:     #21242d;
  --rail:          rgba(22, 24, 31, 0.74);
  --sidebar:       rgba(20, 22, 29, 0.62);
  --line:          rgba(255, 255, 255, 0.08);
  --line-strong:   rgba(255, 255, 255, 0.16);
  --hover:         rgba(255, 255, 255, 0.05);
  --hover-strong:  rgba(255, 255, 255, 0.09);
  --ink:           #f3f4f7;
  --ink-2:         #a7adba;
  --ink-3:         #6f7686;
  --ink-4:         #4b515f;
  --accent-soft:   color-mix(in srgb, var(--accent) 22%, transparent);
  --accent-softer: color-mix(in srgb, var(--accent) 12%, transparent);
  --shadow-window: 0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.06);
  --shadow-pop:    0 16px 50px -10px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.07);
  --shadow-card:   0 1px 2px rgba(0,0,0,.4);
}

/* legacy aliases so unchanged components don't break immediately */
:root {
  --font-sans:    var(--sans);
  --font-mono:    var(--mono);
  --text-primary: var(--ink);
  --text-secondary: var(--ink-2);
  --text-tertiary:  var(--ink-3);
  --radius-sm: var(--r-sm);
  --radius-md: var(--r-md);
  --radius-lg: var(--r-lg);
  --radius-xl: var(--r-xl);
  --radius-full: var(--r-full);
  --ease-default: var(--ease);
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;
  --glass-fill: rgba(255,255,255,0.07);
  --glass-border: rgba(255,255,255,0.12);
  --glass-inner-glow: inset 0 1px 0 rgba(255,255,255,0.15);
  --glass-shadow: var(--shadow-window);
  --accent-subtle: var(--accent-soft);
  --text-on-accent: #fff;
  --titlebar-bg: var(--bg);
  --titlebar-overlay-color: transparent;
}
```

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/styles/variables.css
git commit -m "style: replace design tokens with light-first Liquid Glass palette"
```

---

## Task 2: Global CSS + Component CSS (full replace)

**Files:**
- Modify: `src/renderer/src/styles/global.css`
- Replace: `src/renderer/src/styles/components.css`

- [ ] **Step 1: Add prototype global styles to global.css**

Append to the end of `src/renderer/src/styles/global.css` (after existing content):

```css
/* ── Prototype additions ──────────────────────────────────────────────── */
body { font-family: var(--sans); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }

kbd {
  font-family: var(--mono);
  font-size: 10px; line-height: 1; padding: 3px 5px 2px;
  border-radius: 5px; background: var(--surface-3);
  border: 1px solid var(--line); color: var(--ink-3);
  box-shadow: 0 1px 0 var(--line); min-width: 16px;
  text-align: center; display: inline-block;
}

.scroll { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
.scroll::-webkit-scrollbar { width: 9px; height: 9px; }
.scroll::-webkit-scrollbar-thumb {
  background: var(--line-strong); border-radius: 99px;
  border: 3px solid transparent; background-clip: padding-box;
}
.scroll::-webkit-scrollbar-thumb:hover { background: var(--ink-4); background-clip: padding-box; }

::selection { background: var(--accent-soft); }

@keyframes pop { from { transform: scale(0.97) translateY(8px); } to { transform: none; } }
@keyframes contentrise { from { transform: translateY(8px); } to { transform: none; } }
.fadein { animation: contentrise .3s var(--ease); }
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition-duration: .01ms !important; }
}
```

- [ ] **Step 2: Replace components.css with full prototype component styles**

Completely overwrite `src/renderer/src/styles/components.css` with the CSS from `design_handoff_kumo_redesign/prototype/kumo/styles.css` starting at line 131 (the `/* DESKTOP + WINDOW FRAME */` section) through the end — BUT skip the `*`, `html,body`, `body`, `#root` rules (those are already in global.css). Also add the existing `.btn`, `.glass-card`, `.spinner`, `.context-menu` rules at the top so existing components don't break.

The file should contain in order:
1. Keep existing `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--icon`, `.glass-card`, `.spinner`, `.context-menu`, `.context-menu__*` rules (copy from current file — read it first)
2. Then paste all prototype rules from `.desk` through the end of the file

- [ ] **Step 3: Commit**
```bash
git add src/renderer/src/styles/global.css src/renderer/src/styles/components.css
git commit -m "style: port prototype CSS into components.css and global.css"
```

---

## Task 3: Add missing icons to Icons.jsx

**Files:**
- Modify: `src/renderer/src/components/Icons.jsx`

- [ ] **Step 1: Append new icon exports at the bottom of Icons.jsx**

```jsx
export const IconPhone        = p => <SvgIcon {...p} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
export const IconBuilding     = p => <SvgIcon {...p} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
export const IconPin          = p => <SvgIcon {...p} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
export const IconGlobe        = p => <SvgIcon {...p} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
export const IconClock        = p => <SvgIcon {...p} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
export const IconChevronLeft  = p => <SvgIcon {...p} d="M15 19l-7-7 7-7" />
export const IconChevronRight = p => <SvgIcon {...p} d="M9 5l7 7-7 7" />
export const IconEdit         = p => <SvgIcon {...p} d={["M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5","M17.586 3.586a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"]} />
export const IconArrowDown    = p => <SvgIcon {...p} d="M19 9l-7 7-7-7" />
export const IconMail         = p => <SvgIcon {...p} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
export const IconContacts     = p => <SvgIcon {...p} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
export const IconCalendar     = p => <SvgIcon {...p} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
```

Note: `IconMail`, `IconContacts`, `IconCalendar` may already exist under different names (`IconInbox`, etc.). Check the file first — add only what's missing, and export aliases if needed. `IconEdit` is the same as `IconCompose` — export as a new name rather than duplicating.

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/components/Icons.jsx
git commit -m "feat: add missing icons for redesign (phone, building, pin, globe, clock, chevrons, edit, arrowdown)"
```

---

## Task 4: New Rail.jsx component

**Files:**
- Create: `src/renderer/src/components/Rail.jsx`

- [ ] **Step 1: Create Rail.jsx**

```jsx
import React from 'react'
import { useAppState, useAppDispatch } from '../context/AppContext'
import {
  IconMail, IconContacts, IconCalendar, IconSearch, IconSettings
} from './Icons'

const AVATAR_COLORS = ['#0071e3', '#5e5ebc', '#bf5af2', '#ff6b35', '#30a46c', '#e0820b', '#e5484d', '#0e9bd6']

function avatarColor(email = '') {
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
      <NavBtn id="mail"     Icon={IconMail}      label="Posta"      badge={unread || null} />
      <NavBtn id="contacts" Icon={IconContacts}  label="Contatti" />
      <NavBtn id="calendar" Icon={IconCalendar}  label="Calendario" />
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
      >
        {initials}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/components/Rail.jsx
git commit -m "feat: add Rail component (60px left-rail view switcher)"
```

---

## Task 5: New CommandPalette.jsx

**Files:**
- Create: `src/renderer/src/components/CommandPalette.jsx`

- [ ] **Step 1: Create CommandPalette.jsx**

```jsx
import React, { useState, useRef, useEffect } from 'react'
import { useAppDispatch } from '../context/AppContext'
import {
  IconEdit, IconReply, IconSearch, IconInbox, IconStar,
  IconSent, IconContacts, IconCalendar, IconSettings, IconChevronRight
} from './Icons'

const ICON_MAP = {
  Edit: IconEdit, Reply: IconReply, Search: IconSearch,
  Inbox: IconInbox, Star: IconStar, Sent: IconSent,
  Contacts: IconContacts, Calendar: IconCalendar, Settings: IconSettings
}

const COMMANDS = [
  { id: 'compose',      group: 'Azioni',      label: 'Nuovo messaggio',        icon: 'Edit',     kbd: 'C' },
  { id: 'reply',        group: 'Azioni',      label: 'Rispondi al messaggio',  icon: 'Reply',    kbd: 'R' },
  { id: 'search',       group: 'Azioni',      label: 'Cerca nella posta',      icon: 'Search' },
  { id: 'go-inbox',     group: 'Vai a',       label: 'Posta in arrivo',        icon: 'Inbox',    kbd: 'G I' },
  { id: 'go-starred',   group: 'Vai a',       label: 'Messaggi speciali',      icon: 'Star' },
  { id: 'go-sent',      group: 'Vai a',       label: 'Inviati',                icon: 'Sent' },
  { id: 'go-contacts',  group: 'Vai a',       label: 'Contatti',               icon: 'Contacts' },
  { id: 'go-calendar',  group: 'Vai a',       label: 'Calendario',             icon: 'Calendar' },
  { id: 'go-settings',  group: 'Vai a',       label: 'Impostazioni',           icon: 'Settings' },
  { id: 'theme',        group: 'Preferenze',  label: 'Cambia tema chiaro/scuro', icon: 'Settings' },
  { id: 'density',      group: 'Preferenze',  label: 'Cambia densità elenco',  icon: 'Settings' }
]

export default function CommandPalette({ onClose, selectedMessage, currentTheme, currentDensity }) {
  const dispatch = useAppDispatch()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)

  const filtered = COMMANDS.filter(c => c.label.toLowerCase().includes(q.toLowerCase()))

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setIdx(0) }, [q])

  function run(id) {
    onClose()
    if (id === 'compose')     window.api.window.openCompose({ mode: 'new' })
    else if (id === 'reply' && selectedMessage)
                              window.api.window.openCompose({ mode: 'reply', message: selectedMessage })
    else if (id === 'go-inbox')    { dispatch({ type: 'SET_VIEW', payload: 'mail' }); dispatch({ type: 'SELECT_FOLDER', payload: 'INBOX' }) }
    else if (id === 'go-sent')     { dispatch({ type: 'SET_VIEW', payload: 'mail' }); dispatch({ type: 'SELECT_FOLDER', payload: 'Sent' }) }
    else if (id === 'go-contacts') dispatch({ type: 'SET_VIEW', payload: 'contacts' })
    else if (id === 'go-calendar') dispatch({ type: 'SET_VIEW', payload: 'calendar' })
    else if (id === 'go-settings') dispatch({ type: 'SET_VIEW', payload: 'settings' })
    else if (id === 'theme')       dispatch({ type: 'UPDATE_SETTINGS', payload: { theme: currentTheme === 'dark' ? 'light' : 'dark' } })
    else if (id === 'density')     dispatch({ type: 'UPDATE_SETTINGS', payload: { displayDensity: currentDensity === 'compact' ? 'comfortable' : 'compact' } })
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[idx] && run(filtered[idx].id) }
    else if (e.key === 'Escape') { onClose() }
  }

  let lastGroup = ''
  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <div className="cmdk__search">
          <IconSearch size={19} />
          <input
            ref={inputRef}
            placeholder="Cerca comandi, persone, email…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <div className="cmdk__list scroll">
          {filtered.length === 0
            ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>Nessun risultato</div>
            : filtered.map((c, i) => {
                const showGroup = c.group !== lastGroup; lastGroup = c.group
                const Ic = ICON_MAP[c.icon] || IconChevronRight
                return (
                  <React.Fragment key={c.id}>
                    {showGroup && <div className="cmdk__group">{c.group}</div>}
                    <div
                      className={`cmdk__item${i === idx ? ' active' : ''}`}
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => run(c.id)}
                    >
                      <span className="cmdk__item-ic"><Ic size={17} /></span>
                      <span className="cmdk__item-label">{c.label}</span>
                      {c.kbd && <kbd>{c.kbd}</kbd>}
                    </div>
                  </React.Fragment>
                )
              })
          }
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/components/CommandPalette.jsx
git commit -m "feat: add CommandPalette component (⌘K overlay)"
```

---

## Task 6: App.jsx refactor

**Files:**
- Modify: `src/renderer/src/App.jsx`

- [ ] **Step 1: Replace App.jsx**

Key changes from current:
1. Remove `Toolbar` import and `<Toolbar />` usage
2. Import `Rail` and `CommandPalette`
3. Change layout class to support 4 columns (Rail is inside `app-layout`)
4. Apply `data-theme` to `document.documentElement` (not class on app-root)
5. Apply `--accent`, `--row-pad-y`, `--row-gap`, `--list-fs` to `:root` from settings
6. Add `cmdkOpen` state, open/close via `Ctrl+K`/`Cmd+K` and `Esc`
7. Add `E` key for archive
8. Keep `useResizeHandle` between Sidebar and MessageList only
9. Add `settings` view rendering (currently dispatches `panelOpen`, but new design uses `SET_VIEW`)

```jsx
import React, { useEffect, useRef, useCallback, useState } from 'react'
import { useAppState, useAppDispatch } from './context/AppContext'
import SetupScreen from './components/SetupScreen'
import Rail from './components/Rail'
import Sidebar from './components/Sidebar'
import MessageList from './components/MessageList'
import ReadingPane from './components/ReadingPane'
import ContactsPanel from './components/ContactsPanel'
import CalendarPanel from './components/CalendarPanel'
import ComposeWindow from './components/ComposeWindow'
import Settings from './components/Settings'
import TitleBar from './components/TitleBar'
import UpdateBanner from './components/UpdateBanner'
import CommandPalette from './components/CommandPalette'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 320
const MSGLIST_MIN = 220
const MSGLIST_MAX = 480

function loadWidths() {
  try {
    return {
      sidebar: parseInt(localStorage.getItem('pane-sidebar') || '236', 10),
      msglist: parseInt(localStorage.getItem('pane-msglist') || '320', 10)
    }
  } catch { return { sidebar: 236, msglist: 320 } }
}

function saveWidth(key, value) {
  try { localStorage.setItem(`pane-${key}`, String(value)) } catch { /* ignore */ }
}

function useResizeHandle(containerRef, key, min, max, onResize) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startW.current = containerRef.current
      ? containerRef.current.getBoundingClientRect().width
      : (min + max) / 2
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [containerRef, min, max])

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragging.current) return
      const newW = Math.min(max, Math.max(min, startW.current + (e.clientX - startX.current)))
      if (containerRef.current) containerRef.current.style.width = `${newW}px`
      onResize(newW)
    }
    function onMouseUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (containerRef.current) {
        saveWidth(key, parseInt(containerRef.current.style.width || '0', 10))
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [containerRef, key, min, max, onResize])

  return onMouseDown
}

export default function App() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const view = state.view || 'mail'
  const [cmdkOpen, setCmdkOpen] = useState(false)

  const widths = useRef(loadWidths())
  const sidebarRef = useRef(null)
  const msglistRef = useRef(null)

  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.style.width = `${widths.current.sidebar}px`
    if (msglistRef.current) msglistRef.current.style.width = `${widths.current.msglist}px`
  }, [])

  const onSidebarResize = useCallback(w => { widths.current.sidebar = w }, [])
  const onMsglistResize = useCallback(w => { widths.current.msglist = w }, [])
  const onSidebarDrag = useResizeHandle(sidebarRef, 'sidebar', SIDEBAR_MIN, SIDEBAR_MAX, onSidebarResize)
  const onMsglistDrag = useResizeHandle(msglistRef, 'msglist', MSGLIST_MIN, MSGLIST_MAX, onMsglistResize)

  // Badge
  useEffect(() => {
    const total = state.folders.list.reduce((sum, f) => sum + (f.unread_count || 0), 0)
    window.api.window.setBadge(total)
  }, [state.folders.list])

  // Apply theme via data-theme on documentElement
  useEffect(() => {
    const resolved = state.settings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : (state.settings.theme || 'light')
    document.documentElement.setAttribute('data-theme', resolved)
  }, [state.settings.theme])

  // Apply density vars to :root
  useEffect(() => {
    const r = document.documentElement
    if (state.settings.displayDensity === 'comfortable') {
      r.style.setProperty('--row-pad-y', '11px')
      r.style.setProperty('--row-gap', '12px')
      r.style.setProperty('--list-fs', '14px')
    } else {
      r.style.setProperty('--row-pad-y', '7px')
      r.style.setProperty('--row-gap', '10px')
      r.style.setProperty('--list-fs', '13px')
    }
  }, [state.settings.displayDensity])

  // Apply accent color
  useEffect(() => {
    if (state.settings.accentColor) {
      document.documentElement.style.setProperty('--accent', state.settings.accentColor)
    }
  }, [state.settings.accentColor])

  // System theme sync
  useEffect(() => {
    if (state.settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = e => document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
    apply(mq)
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [state.settings.theme])

  // IPC listeners
  useEffect(() => {
    const offNewMail  = window.api.on('imap:new-mail', data => dispatch({ type: 'NEW_MAIL', payload: data }))
    const offStatus   = window.api.on('imap:connection-status', status => {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: status })
      if (status === 'connecting' || status === 'reconnecting') {
        dispatch({ type: 'SET_LOADING', payload: status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…' })
      } else {
        dispatch({ type: 'CLEAR_LOADING' })
      }
    })
    const offCompose  = window.api.on('open-compose', data => window.api.window.openCompose(data || { mode: 'new' }))
    const offSync     = window.api.on('imap:sync-complete', ({ folder, newCount, removedCount }) =>
      dispatch({ type: 'SYNC_COMPLETE', payload: { folder, newCount, removedCount } }))
    const offFlags    = window.api.on('imap:flags-updated', ({ folder, uid, flags }) =>
      dispatch({ type: 'UPDATE_MESSAGE_FLAGS', payload: { folder, uid, flags } }))
    const offNotif    = window.api.on('imap:notification-click', ({ folder, uid }) =>
      dispatch({ type: 'NOTIF_OPEN_MAIL', payload: { folder, uid } }))
    return () => { offNewMail?.(); offStatus?.(); offCompose?.(); offSync?.(); offFlags?.(); offNotif?.() }
  }, [dispatch])

  // Keyboard shortcuts
  useEffect(() => {
    if (!state.auth.isAuthenticated) return
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setCmdkOpen(v => !v); return
      }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.target.contentEditable === 'true') return
      if (cmdkOpen) { if (e.key === 'Escape') setCmdkOpen(false); return }
      switch (e.key) {
        case 'c': window.api.window.openCompose({ mode: 'new' }); break
        case 'r':
          if (state.messages.selected)
            window.api.window.openCompose({ mode: 'reply', message: state.messages.selected })
          break
        case 'e':
        case 'E':
          if (state.messages.selected && view === 'mail') {
            const msg = state.messages.selected
            dispatch({ type: 'REMOVE_MESSAGE', payload: { uid: msg.uid, folder: msg.folder } })
            window.api.imap.archiveMessage?.(msg.folder, msg.uid)
          }
          break
        case 'Delete':
        case 'Backspace':
          if (state.messages.selected && view === 'mail') {
            const msg = state.messages.selected
            dispatch({ type: 'REMOVE_MESSAGE', payload: { uid: msg.uid, folder: msg.folder } })
            window.api.imap.deleteMessage(msg.folder, msg.uid, false)
          }
          break
        case 'Escape':
          if (state.compose.isOpen) dispatch({ type: 'CLOSE_COMPOSE' })
          break
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [state.auth.isAuthenticated, state.compose.isOpen, state.messages.selected, view, dispatch, cmdkOpen])

  if (!state.auth.isAuthenticated) {
    return (
      <div className="app-root">
        <TitleBar />
        <SetupScreen />
      </div>
    )
  }

  return (
    <div className="app-root">
      <TitleBar connectionStatus={state.connectionStatus} />
      <UpdateBanner />
      <div className="app-layout">
        <Rail onSearch={() => setCmdkOpen(true)} />
        {view === 'mail' ? (
          <>
            <div className="app-layout__sidebar" ref={sidebarRef}>
              <Sidebar />
            </div>
            <div className="resize-handle resize-handle--vertical" onMouseDown={onSidebarDrag} />
            <div className="app-layout__msglist" ref={msglistRef}>
              <MessageList />
            </div>
            <div className="resize-handle resize-handle--vertical" onMouseDown={onMsglistDrag} />
            <div className="app-layout__reading">
              <ReadingPane />
            </div>
          </>
        ) : null}
        {view === 'contacts' && <div className="app-layout__full"><ContactsPanel /></div>}
        {view === 'calendar' && <div className="app-layout__full"><CalendarPanel /></div>}
        {view === 'settings' && <div className="app-layout__full"><Settings /></div>}
      </div>
      {state.compose.isOpen && <ComposeWindow />}
      {cmdkOpen && (
        <CommandPalette
          onClose={() => setCmdkOpen(false)}
          selectedMessage={state.messages.selected}
          currentTheme={state.settings.theme || 'light'}
          currentDensity={state.settings.displayDensity || 'compact'}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/App.jsx
git commit -m "refactor: 4-col layout with Rail, remove Toolbar, add CommandPalette and ⌘K"
```

---

## Task 7: AppContext — add new settings fields

**Files:**
- Modify: `src/renderer/src/context/AppContext.jsx`

- [ ] **Step 1: Add new settings fields to initialState**

In `initialState.settings`, add after `language: 'en-US'`:
```js
accentColor: '#0071e3',
showAvatars: true,
showPreview: true,
```

Also add the `'settings'` view to the `SET_VIEW` handling (it already works, just documenting).

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/context/AppContext.jsx
git commit -m "feat: add accentColor, showAvatars, showPreview to settings state"
```

---

## Task 8: Sidebar.jsx restyle

**Files:**
- Modify: `src/renderer/src/components/Sidebar.jsx`

- [ ] **Step 1: Remove nav-tabs, add new header + compose btn + storage footer**

Key structural changes (preserve all logic: `loadFolders`, `handleFolderDrop`, `handleFolderAction`, `FolderMenu`, `AvatarMenu`):

1. Remove the entire `<div className="sidebar__nav-tabs">` block
2. Remove `<div className="sidebar__footer">` block (avatar/refresh move to Rail)
3. Remove `<div className="sidebar__loading-bar">` block
4. Add new header at top of sidebar:
```jsx
<div className="sidebar__head">
  <div className="sidebar__acct-label">iCloud</div>
  <div className="sidebar__acct-email">{state.auth.email}</div>
</div>
```
5. Add compose button after header:
```jsx
<button className="compose-btn" onClick={openCompose}>
  <IconEdit size={15} /> Nuovo messaggio <kbd>C</kbd>
</button>
```
6. Wrap folder list in `<div className="sidebar__scroll scroll">` with group labels using className `"sidebar__group-label"` 
7. Rename folder row class from `folder-item` → `folder`, `folder-item__icon` → `folder__icon`, `folder-item__name` → `folder__name`, `folder-item__badge` → `folder__count badge` (for inbox) or `folder__count` (others)
8. Add footer with storage bar:
```jsx
<div className="sidebar__foot">
  <div className="storage">
    <div className="storage__bar">
      <div className="storage__fill" style={{ width: '34%' }} />
    </div>
    <div className="storage__label">Spazio iCloud</div>
  </div>
  <button className="icon-btn" title="Aggiorna" onClick={handleRefresh}>
    <IconRefresh size={16} className={isSyncing ? 'spin' : ''} />
  </button>
</div>
```

Keep: `FolderMenu`, `AvatarMenu`, `handleFolderDrop`, all `window.api` calls, drag-over logic.
Import `IconEdit` in addition to existing imports.

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/components/Sidebar.jsx
git commit -m "refactor: restyle Sidebar with new header, compose btn, storage footer; remove nav-tabs"
```

---

## Task 9: MessageList.jsx restyle

**Files:**
- Modify: `src/renderer/src/components/MessageList.jsx`

- [ ] **Step 1: Update MessageList to new class structure and UI**

Key changes (preserve all logic: search, FTS5, threading, load-more, multi-select, drag):

**Header section** (add above existing content):
```jsx
<div className="list__head">
  <div className="list__titlerow">
    <span className="list__title">{folderName}</span>
    <span className="list__count">{totalCount}</span>
    <div className="list__head-actions">
      <button className="icon-btn" onClick={handleRefresh}><IconRefresh size={16} /></button>
    </div>
  </div>
  <div className="search">
    <span className="search__icon"><IconSearch size={15} /></span>
    <input placeholder="Cerca nella posta…" value={localSearch} onChange={e => setLocalSearch(e.target.value)} />
    {localSearch
      ? <button className="icon-btn" style={{width:22,height:22}} onClick={() => setLocalSearch('')}><IconClose size={13} /></button>
      : <kbd>⌘K</kbd>}
  </div>
</div>
```

**Filters bar**:
```jsx
<div className="list__filters">
  <div className="seg">
    {[['all','Tutte'],['unread','Non lette'],['starred','Speciali']].map(([f,l]) => (
      <button key={f} className={`seg__btn${activeFilter===f?' active':''}`} onClick={() => setActiveFilter(f)}>{l}</button>
    ))}
  </div>
  <button className="sortbtn" onClick={cycleSortBy}>
    {sortLabel} <IconArrowDown size={13} />
  </button>
</div>
```

Add local state: `const [activeFilter, setActiveFilter] = useState('all')` and `const [sortBy, setSortBy] = useState('date-desc')`.

Sort cycle: `date-desc` → `date-asc` → `from` → back. Labels: `{ 'date-desc': 'Più recenti', 'date-asc': 'Più vecchi', from: 'Mittente' }`.

Apply filter to displayed list before rendering.

**Message row** — rename JSX classes from current (`message-item`, etc.) to new (`.mail`, `.mail__avatar`, `.mail__body`, `.mail__r1`, `.mail__from`, `.mail__time`, `.mail__subject`, `.mail__preview`, `.mail__unread`, `.mail__qa`):

```jsx
<div
  key={msgKey(msg)}
  className={`mail${isSelected?' sel':''}${isRead?' read':''}`}
  data-avatars={showAvatars ? 'on' : 'off'}
  data-preview={showPreview ? 'on' : 'off'}
  onClick={() => selectMessage(msg)}
  draggable
  onDragStart={...existing drag logic...}
>
  <span className="mail__unread" />
  <div className="mail__avatar" style={{ background: getAvatarColor(senderName) }}>
    {getInitials(senderName, senderEmail)}
  </div>
  <div className="mail__body">
    <div className="mail__r1">
      <span className="mail__from">{senderName || senderEmail}</span>
      {isStarred && <span className="mail__star"><IconStar size={12} fill="currentColor" /></span>}
      <span className="mail__time">{formatDate(msg.date)}</span>
    </div>
    <div className="mail__subject">{msg.subject}</div>
    <div className="mail__preview">
      {hasAttachments && <IconAttach size={12} />}
      <span>{msg.snippet || msg.preview || ''}</span>
    </div>
  </div>
  <div className="mail__qa" onClick={e => e.stopPropagation()}>
    <button className="qa-btn" title="Rispondi" onClick={() => handleReply(msg)}><IconReply size={15} /></button>
    <button className={`qa-btn${isStarred?' on':''}`} title="Stella" onClick={() => toggleStar(msg)}><IconStar size={15} fill={isStarred?'currentColor':'none'} /></button>
    <button className="qa-btn" title="Segna letta" onClick={() => toggleRead(msg)}><IconMarkRead size={15} /></button>
    <button className="qa-btn qa-btn--danger" title="Elimina" onClick={() => deleteMsg(msg)}><IconTrash size={15} /></button>
  </div>
</div>
```

`showAvatars` = `state.settings.showAvatars ?? true`
`showPreview` = `state.settings.showPreview ?? true`

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/components/MessageList.jsx
git commit -m "refactor: restyle MessageList with new header, segmented filter, sort, .mail rows, quick actions"
```

---

## Task 10: ReadingPane.jsx restyle

**Files:**
- Modify: `src/renderer/src/components/ReadingPane.jsx`

- [ ] **Step 1: Update ReadingPane to new class structure**

Key changes (preserve iframe logic, `buildEmailIframeDoc`, `buildSafeHTML`, attachment download, `imagesBlocked` logic):

**Empty state** — change from current to:
```jsx
<div className="reader">
  <div className="reader__empty">
    <div className="reader__empty-mark"><IconEnvelope size={30} /></div>
    <h3>Seleziona un messaggio</h3>
    <p>Scegli un'email dall'elenco per leggerla qui. Usa ↑ ↓ per navigare.</p>
  </div>
</div>
```

**Header** when message selected:
```jsx
<div className="reader__head fadein">
  <div className="reader__subject">{msg.subject}</div>
  <div className="reader__metarow">
    <div className="reader__sender-av" style={{ background: getAvatarColor(senderName) }}>
      {getInitials(senderName, senderEmail)}
    </div>
    <div className="reader__sender">
      <div className="reader__sender-name">
        {senderName} <span style={{fontWeight:400,color:'var(--ink-3)',fontSize:12.5}}>{'<'+senderEmail+'>'}</span>
      </div>
      <div className="reader__sender-detail">a <b>{recipientNames}</b></div>
    </div>
    <div className="reader__date">{formatFullDate(msg.date)}</div>
  </div>
</div>
```

**Toolbar** (`.reader__bar`) — absorb old Toolbar actions:
```jsx
<div className="reader__bar">
  <button className="act act--primary" onClick={handleReply}><IconReply size={15} /> Rispondi <kbd>R</kbd></button>
  <button className="act" onClick={handleReplyAll}><IconReplyAll size={15} /> Tutti</button>
  <button className="act" onClick={handleForward}><IconForward size={15} /> Inoltra</button>
  <div className="reader__bar-sep" />
  <button className={`icon-btn${isStarred?' on':''}`} title="Stella" onClick={toggleStar}><IconStar size={17} fill={isStarred?'currentColor':'none'} /></button>
  <button className="icon-btn" title="Segna letta" onClick={toggleRead}><IconMarkRead size={17} /></button>
  <button className="icon-btn" title="Spam" onClick={markJunk}><IconNoSymbol size={17} /></button>
  <button className="icon-btn" title="Archivia" onClick={handleArchive}><IconArchive size={17} /></button>
  <button className="icon-btn" title="Elimina" onClick={handleDelete}><IconTrash size={17} /></button>
</div>
```

**Image banner** (when blocked):
```jsx
{imagesBlocked && (
  <div className="banner">
    <span>🔒 Immagini remote bloccate per la tua privacy</span>
    <button onClick={loadImages}>Carica immagini</button>
  </div>
)}
```

**Body** — keep `<iframe>` unchanged, only update wrapper:
```jsx
<div className="reader__body scroll">
  <iframe ... /> {/* unchanged */}
</div>
```

**Attachments** — use `.attach` / `.attach__chip` / `.attach__ic` / `.attach__name` / `.attach__size`:
```jsx
<div className="attach">
  {attachments.map((a, i) => (
    <div key={i} className="attach__chip" onClick={() => downloadAttachment(a)}>
      <div className="attach__ic" style={{ background: fileIconColor(a) }}>
        <IconFileDoc size={17} />
      </div>
      <div>
        <div className="attach__name">{a.filename}</div>
        <div className="attach__size">{formatSize(a.size)}</div>
      </div>
      <button className="icon-btn" title="Scarica"><IconDownload size={15} /></button>
    </div>
  ))}
</div>
```

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/components/ReadingPane.jsx
git commit -m "refactor: restyle ReadingPane with new header, reader__bar toolbar, attachments"
```

---

## Task 11: ContactsPanel.jsx restyle

**Files:**
- Modify: `src/renderer/src/components/ContactsPanel.jsx`

- [ ] **Step 1: Update ContactsPanel JSX to use prototype class names**

Wrap everything in `<div className="full">`. Two columns:

Left column `.contacts__list`:
```jsx
<div className="contacts__list">
  <div className="contacts__head">
    <div className="search">
      <span className="search__icon"><IconSearch size={15} /></span>
      <input placeholder="Cerca contatti…" value={searchQuery} onChange={...} />
    </div>
  </div>
  <div className="contacts__scroll scroll">
    {/* alpha separators + .crow rows */}
    <div className="contacts__alpha">{letter}</div>
    <div className={`crow${selected===c?' active':''}`} onClick={() => selectContact(c)}>
      <div className="crow__av" style={{ background: avatarColor(c.name) }}>{initials(c.name)}</div>
      <div>
        <div className="crow__name">{c.name}</div>
        <div className="crow__sub">{c.email || c.company}</div>
      </div>
    </div>
  </div>
</div>
```

Right column `.cdetail`:
```jsx
<div className="cdetail scroll">
  <div className="cdetail__av fadein" style={{ background: avatarColor(sel.name) }}>{initials(sel.name)}</div>
  <div className="cdetail__name">{sel.name}</div>
  <div className="cdetail__role">{sel.jobTitle}</div>
  <div className="cdetail__actions">
    <button className="act act--primary" onClick={() => composeToContact(sel)}><IconMail size={15} /> Email</button>
    {sel.phone && <button className="act"><IconPhone size={15} /> Chiama</button>}
  </div>
  <div className="cdetail__card">
    {sel.email && <div className="cfield">...</div>}
    {sel.phone && <div className="cfield">...</div>}
    {sel.company && <div className="cfield">...</div>}
  </div>
</div>
```

Keep all existing `window.api.contacts.*` calls, loading states, search logic.
Import `IconPhone`, `IconBuilding`, `IconPin`, `IconMail` (or alias of IconInbox).

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/components/ContactsPanel.jsx
git commit -m "refactor: restyle ContactsPanel with .full, .contacts__list, .crow, .cdetail, .cfield"
```

---

## Task 12: CalendarPanel.jsx restyle

**Files:**
- Modify: `src/renderer/src/components/CalendarPanel.jsx`

- [ ] **Step 1: Update CalendarPanel JSX to use prototype class names**

Wrap in `<div className="cal">`. Left sidebar `.cal__side` (300px):
```jsx
<div className="cal__side">
  <div className="mini">
    <div className="mini__nav">
      <button className="icon-btn"><IconChevronLeft size={16} /></button>
      <span className="mini__month">{monthName} {year}</span>
      <button className="icon-btn"><IconChevronRight size={16} /></button>
    </div>
    <div className="mini__grid">
      {/* day-name headers .mini__dn */}
      {/* day cells .mini__day, .today, .dot-day */}
    </div>
  </div>
  <div className="cal__events scroll">
    {/* .cal__daylabel + .ev rows */}
    <div className="cal__daylabel">{dateLabel}</div>
    <div className={`ev${sel===e?' active':''}`} onClick={() => setSel(e)}>
      <div className="ev__rail" style={{ background: e.color }} />
      <div>
        <div className="ev__title">{e.title}</div>
        <div className="ev__time"><IconClock size={12} /> {e.time}</div>
      </div>
    </div>
  </div>
</div>
```

Right detail `.cal__detail`:
```jsx
<div className="cal__detail scroll">
  {sel ? (
    <div className="fadein">
      <div className="evd__chip">...</div>
      <div className="evd__title">{sel.title}</div>
      <div className="evd__row"><IconClock size={17} /> {sel.time}</div>
      <div className="evd__row"><IconPin size={17} /> {sel.location}</div>
      {sel.attendees?.length > 0 && (
        <div className="evd__attendees">
          {sel.attendees.map(a => (
            <div key={a} className="evd__att">
              <div className="evd__att-av" style={{ background: avatarColor(a) }}>{initials(a)}</div>
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : (
    <div className="cal__detail-empty">
      <IconCalendar size={48} /><span>Seleziona un evento</span>
    </div>
  )}
</div>
```

Keep all `window.api.calendar.*` calls, loading states, month navigation logic.
Import `IconChevronLeft`, `IconChevronRight`, `IconClock`, `IconPin`.

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/components/CalendarPanel.jsx
git commit -m "refactor: restyle CalendarPanel with .cal, .mini, .ev, .cal__detail, .evd__* classes"
```

---

## Task 13: Settings.jsx restyle

**Files:**
- Modify: `src/renderer/src/components/Settings.jsx`

- [ ] **Step 1: Restyle Settings and wire new settings flags**

Settings is now a full-page view (no modal/overlay), rendered inside `app-layout__full`. Remove any modal wrapper.

Structure:
```jsx
<div className="full">
  <div className="settings scroll">
    <div className="settings__inner">
      <div className="settings__title">Impostazioni</div>
      <div className="settings__sub">Personalizza l'aspetto e il comportamento di Kumo</div>

      {/* Aspetto */}
      <div className="sset">
        <div className="sset__label">Aspetto</div>
        <div className="sset__card">
          {/* Tema row */}
          <div className="srow">
            <div className="srow__txt">
              <div className="srow__name">Tema</div>
              <div className="srow__desc">Chiaro o scuro</div>
            </div>
            <div className="segsm">
              {[['light','Chiaro'],['dark','Scuro']].map(([v,l]) => (
                <button key={v} className={theme===v?'active':''} onClick={() => updateSetting('theme',v)}>{l}</button>
              ))}
            </div>
          </div>
          {/* Accento row */}
          <div className="srow">
            <div className="srow__txt">
              <div className="srow__name">Colore accento</div>
              <div className="srow__desc">Tinta dei pulsanti e degli elementi attivi</div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {['#0071e3','#5e5ebc','#1f9d57','#e0820b','#e5484d'].map(c => (
                <button key={c} onClick={() => updateSetting('accentColor',c)}
                  style={{ width:26, height:26, borderRadius:99, background:c, cursor:'pointer',
                    border: accentColor===c ? '2px solid var(--ink)' : '2px solid transparent',
                    boxShadow: '0 0 0 2px var(--surface-2)' }} />
              ))}
            </div>
          </div>
          {/* Densità row */}
          <div className="srow">
            <div className="srow__txt">
              <div className="srow__name">Densità elenco</div>
              <div className="srow__desc">Quante email mostrare a schermo</div>
            </div>
            <div className="segsm">
              {[['compact','Compatta'],['comfortable','Comoda']].map(([v,l]) => (
                <button key={v} className={density===v?'active':''} onClick={() => updateSetting('displayDensity',v)}>{l}</button>
              ))}
            </div>
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
            <button className={`switch${showAvatars?' on':''}`} onClick={() => updateSetting('showAvatars',!showAvatars)} />
          </div>
          <div className="srow">
            <div className="srow__txt">
              <div className="srow__name">Anteprima testo</div>
              <div className="srow__desc">Riga di anteprima del contenuto</div>
            </div>
            <button className={`switch${showPreview?' on':''}`} onClick={() => updateSetting('showPreview',!showPreview)} />
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
            <button className={`switch${blockImages?' on':''}`} onClick={() => updateSetting('blockRemoteImages',!blockImages)} />
          </div>
          <div className="srow">
            <div className="srow__txt">
              <div className="srow__name">Notifiche nuovi messaggi</div>
              <div className="srow__desc">Mostra notifiche Windows per la nuova posta</div>
            </div>
            <button className={`switch${notifs?' on':''}`} onClick={() => updateSetting('notificationsEnabled',!notifs)} />
          </div>
        </div>
      </div>

      {/* Account */}
      <div className="sset">
        <div className="sset__label">Account</div>
        <div className="sset__card">
          <div className="srow">
            <div className="reader__sender-av" style={{width:38,height:38,fontSize:13,background:'linear-gradient(150deg,#0071e3,#5e5ebc)'}}>
              {initials}
            </div>
            <div className="srow__txt">
              <div className="srow__name">{email}</div>
            </div>
            <button className="act" onClick={signOut}><IconSignOut size={15} /> Esci</button>
          </div>
          <div className="srow">
            <span><IconGlobe size={17} style={{color:'var(--ink-3)'}} /></span>
            <div className="srow__txt"><div className="srow__name">Lingua</div></div>
            <div className="srow__name" style={{color:'var(--ink-2)'}}>Italiano</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

`updateSetting(key, value)` calls `dispatch({ type: 'UPDATE_SETTINGS', payload: { [key]: value } })` and also persists via `window.api.settings.set({ [key]: value })` if that API exists.

Remove any modal/overlay wrapper that was there before (Settings is now a page, not an overlay).

- [ ] **Step 2: Remove Settings from modal overlay in App.jsx**

In `App.jsx`, the `{state.settings.panelOpen && <Settings />}` line at the bottom is already removed in Task 6 (Settings now renders as `view === 'settings'`). Verify the `TOGGLE_SETTINGS` / `CLOSE_SETTINGS` dispatch calls in the old Sidebar footer are also removed (done in Task 8). The `panelOpen` field in AppContext can remain for backwards compat but is no longer used.

- [ ] **Step 3: Commit**
```bash
git add src/renderer/src/components/Settings.jsx src/renderer/src/context/AppContext.jsx
git commit -m "refactor: restyle Settings as full-page view; wire accentColor, showAvatars, showPreview"
```

---

## Task 14: CSS wiring — app-layout + body background

**Files:**
- Modify: `src/renderer/src/styles/global.css`

- [ ] **Step 1: Update app-layout rules**

The `.app-layout` needs to flex horizontally and include the Rail. Add/update in global.css:

```css
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
  color: var(--ink);
}

.app-layout {
  flex: 1;
  display: flex;
  min-height: 0;
  background:
    radial-gradient(90% 70% at 0% 0%, var(--accent-softer) 0%, transparent 55%),
    var(--bg-tint);
}

.app-layout__sidebar  { flex-shrink: 0; min-height: 0; display: flex; flex-direction: column; }
.app-layout__msglist  { flex-shrink: 0; min-height: 0; }
.app-layout__reading  { flex: 1; min-width: 0; min-height: 0; }
.app-layout__full     { flex: 1; min-width: 0; min-height: 0; display: flex; }

.resize-handle--vertical {
  width: 1px;
  background: var(--line);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background .15s;
}
.resize-handle--vertical:hover { background: var(--accent-soft); width: 2px; }
```

- [ ] **Step 2: Commit**
```bash
git add src/renderer/src/styles/global.css
git commit -m "style: update app-layout for 4-col Rail design, bg-tint gradient"
```

---

## Self-review

**Spec coverage check:**
- §4 layout: Rail(60px) | Sidebar(236px) | MessageList | ReadingPane ✓ (Task 4, 6)
- §5.1 Rail: ✓ (Task 4)
- §5.2 Sidebar: ✓ (Task 8)
- §5.3 MessageList: ✓ (Task 9)
- §5.4 ReadingPane: ✓ (Task 10)
- §5.5 Contacts: ✓ (Task 11)
- §5.6 Calendar: ✓ (Task 12)
- §5.7 Settings: ✓ (Task 13)
- §7 CommandPalette + ⌘K: ✓ (Task 5, 6)
- §8 CSS strategy (new classes, data-theme): ✓ (Task 1, 2, 6)
- §9 Design tokens: ✓ (Task 1)
- §10 Runtime tweaks (accent, theme, density, avatars, preview): ✓ (Tasks 6, 7, 13)
- Resize handles preserved: ✓ (Task 6)
- Drag-drop folder: ✓ (Task 8 — logic preserved)
- Remove Toolbar: ✓ (Task 6)
- Remove nav-tabs from Sidebar: ✓ (Task 8)
- `E` key for archive: ✓ (Task 6)
- Toolbar actions absorbed into ReadingPane: ✓ (Task 10)
- `data-avatars` / `data-preview` attributes: ✓ (Task 9)
- Settings as page not overlay: ✓ (Task 13)
- Legacy CSS aliases (so existing components don't break): ✓ (Task 1)

**Gap identified:** Task 2 Step 2 says "read the current components.css first" — this is implicit. The executor must read `components.css` before overwriting it to extract the `.btn`, `.glass-card`, `.spinner`, `.context-menu` rules.
