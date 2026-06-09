# Sender Brand Logos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in BIMI and direct-domain favicon avatars for received messages, with persistent caching and colored initials as fallback.

**Architecture:** The Electron main process owns DNS, HTTP validation, sanitization, and a persistent domain cache. A narrow IPC API returns validated data URLs to a shared renderer avatar component; Sent, Drafts, and Outbox contexts never request logos.

**Tech Stack:** Electron 29, Node DNS/HTTPS, React 18, sql.js, Node test runner.

---

### Task 1: Pure sender-logo discovery rules

**Files:**
- Create: `src/main/senderLogo.js`
- Create: `src/main/senderLogo.test.mjs`

- [ ] Write failing tests for email-domain normalization, folder exclusion, BIMI TXT parsing, favicon link parsing, public-address validation, image-type validation, and SVG sanitization.
- [ ] Run `node --test src/main/senderLogo.test.mjs` and confirm failures are caused by missing exports.
- [ ] Implement the pure helpers with no network or Electron dependency.
- [ ] Run the focused test and confirm it passes.

### Task 2: Persistent cache and secure resolver

**Files:**
- Create: `src/main/senderLogoResolver.js`
- Create: `src/main/senderLogoResolver.test.mjs`
- Modify: `src/main/store/db.js`

- [ ] Write failing resolver tests using injected DNS and fetch functions for BIMI priority, favicon fallback, negative cache, TTL expiry, request deduplication, redirect limits, timeout, size limits, and private-address rejection.
- [ ] Run `node --test src/main/senderLogoResolver.test.mjs` and confirm the resolver is missing.
- [ ] Add a `sender_logo_cache` table and focused DB helpers for reading, writing, and clearing domain results.
- [ ] Implement the resolver with injected dependencies, HTTPS-only redirects, bounded responses, sanitized SVG, and debug-only domain logging.
- [ ] Run both sender-logo test files and confirm they pass.

### Task 3: Settings and IPC contract

**Files:**
- Modify: `src/main/store/db.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/index.js`
- Create: `src/main/senderLogoIpc.test.mjs`

- [ ] Write a failing source-contract test proving `showSenderLogos` defaults to `false`, disabled requests perform no resolution, and preload exposes only `getSenderLogo(email, folderSpecialUse)`.
- [ ] Run the focused IPC test and confirm it fails.
- [ ] Add the default setting, instantiate the resolver after DB initialization, expose `sender-logo:get`, and return `{ ok, dataUrl, source }` without remote URLs.
- [ ] Ensure reset-all-data clears logo cache records/files.
- [ ] Run the focused IPC and resolver tests.

### Task 4: Shared renderer avatar

**Files:**
- Create: `src/renderer/src/components/SenderAvatar.jsx`
- Create: `src/renderer/src/components/senderAvatar.test.mjs`
- Modify: `src/renderer/src/components/MessageList.jsx`
- Modify: `src/renderer/src/components/ReadingPane.jsx`
- Modify: `src/renderer/src/components/MessageViewerApp.jsx`
- Modify: `src/renderer/src/styles/components.css`

- [ ] Write failing component/source tests for initials fallback, opt-in logo requests, exclusion of special-use outgoing folders, and no remote URL rendering.
- [ ] Run `node --test src/renderer/src/components/senderAvatar.test.mjs` and confirm it fails.
- [ ] Implement a fixed-size shared avatar that requests once per domain, renders validated data URLs, handles stale async responses, and keeps initials while loading or on failure.
- [ ] Replace duplicated sender avatar rendering in the list, reading pane, and separate reader.
- [ ] Preserve recipient initials for Sent, Drafts, and Outbox rows.
- [ ] Run the focused renderer tests.

### Task 5: Settings UI and localization

**Files:**
- Modify: `src/renderer/src/context/AppContext.jsx`
- Modify: `src/renderer/src/components/Settings.jsx`
- Modify: `src/renderer/src/locales/*.json`
- Modify: `src/renderer/src/i18n/locales.test.mjs`

- [ ] Add a failing localization/settings source test for `settings.showSenderLogos` and `settings.showSenderLogosDesc` across all locales.
- [ ] Run the locale tests and confirm the missing keys fail.
- [ ] Add `showSenderLogos: false` to renderer defaults and a Privacy switch explaining direct requests to sender domains.
- [ ] Translate both keys in all supported locales.
- [ ] Run locale and settings tests.

### Task 6: Full verification

**Files:**
- Verify all modified files.

- [ ] Run `npm test`.
- [ ] Run `git diff --check`.
- [ ] Inspect `git diff --stat` and `git status --short` to confirm only intended implementation/spec/plan files changed.
- [ ] Do not build unless a test or syntax check shows the Electron/Vite integration requires it.
- [ ] Report implementation, verification results, privacy behavior, and remaining limitations without committing.
