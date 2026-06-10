# Settings, Search, Diagnostics, Signature, and Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an organized category-based settings UI, HTML signatures, diagnostic log export, advanced message search, and attachment navigation.

**Architecture:** Keep reusable behavior in small pure modules, expose only narrow IPC methods through preload, and let existing React screens own presentation state. Settings become category pages selected by a persistent left navigation; existing cards and actions are retained inside their new categories.

**Tech Stack:** Electron 29, React 18, Quill 2, sql.js, Node test runner, CSS.

---

### Task 1: Diagnostic report export

**Files:**
- Create: `src/main/diagnosticReport.js`
- Create: `src/main/diagnosticReport.test.mjs`
- Modify: `src/main/index.js`
- Modify: `src/preload/index.js`

- [ ] Write a failing test proving report metadata excludes credentials and message bodies, and collects current and rotated log files.
- [ ] Run `node --test src/main/diagnosticReport.test.mjs` and verify the missing module failure.
- [ ] Implement `buildDiagnosticReport({ logsDir, destination, appVersion, platform, locale })` using UTF-8 text files inside one report directory, with a manifest and copied logs.
- [ ] Add `store:export-diagnostics` IPC with a save-directory dialog and expose `store.exportDiagnostics()`.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Advanced search criteria

**Files:**
- Create: `src/main/store/searchCriteria.js`
- Create: `src/main/store/searchCriteria.test.mjs`
- Modify: `src/main/store/db.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/index.js`
- Modify: `src/renderer/src/components/MessageList.jsx`

- [ ] Write failing tests for text, sender, recipient, subject, date range, unread, starred, and attachment filters.
- [ ] Run `node --test src/main/store/searchCriteria.test.mjs` and verify the missing module failure.
- [ ] Implement normalized criteria and SQL predicate construction with bound parameters.
- [ ] Extend `searchMessages` and `store:search-local` to accept either text or structured criteria while preserving existing text search.
- [ ] Add a collapsible advanced-search panel under the current search box and keep server search for simple text only.
- [ ] Re-run the focused tests and verify they pass.

### Task 3: HTML signature

**Files:**
- Create: `src/renderer/src/signatureHtml.js`
- Create: `src/renderer/src/signatureHtml.test.mjs`
- Modify: `src/renderer/src/components/Settings.jsx`
- Modify: `src/renderer/src/components/ComposeWindow.jsx`
- Modify: `src/renderer/src/components/ComposeViewerApp.jsx`

- [ ] Write failing tests proving an HTML signature is appended without adding nested paragraph markup and empty Quill HTML is ignored.
- [ ] Run `node --test src/renderer/src/signatureHtml.test.mjs` and verify the missing module failure.
- [ ] Implement `normalizeSignatureHtml` and `buildSignatureBlock`.
- [ ] Add `RichTextEditor` to the writing settings category and save the HTML through existing settings persistence.
- [ ] Replace both compose implementations' plain-text wrapping with `buildSignatureBlock`.
- [ ] Re-run the focused test and verify it passes.

### Task 4: Attachment navigation

**Files:**
- Create: `src/renderer/src/attachmentNavigation.js`
- Create: `src/renderer/src/attachmentNavigation.test.mjs`
- Modify: `src/renderer/src/components/AttachmentPreviewPanel.jsx`
- Modify: `src/renderer/src/components/ReadingPane.jsx`
- Modify: `src/renderer/src/components/MessageViewerApp.jsx`

- [ ] Write failing tests for filtering previewable files and moving to previous/next indices without leaving bounds.
- [ ] Run `node --test src/renderer/src/attachmentNavigation.test.mjs` and verify the missing module failure.
- [ ] Implement previewable attachment helpers.
- [ ] Pass current position, count, and navigation callbacks into the shared preview panel.
- [ ] Add toolbar arrows, counter, and Left/Right keyboard navigation.
- [ ] Re-run the focused test and existing attachment preview tests.

### Task 5: Settings information architecture

**Files:**
- Modify: `src/renderer/src/components/Settings.jsx`
- Modify: `src/renderer/src/styles/components.css`

- [ ] Add a source-level failing test that requires a persistent settings navigation and category panels.
- [ ] Run the test and verify it fails against the current single-column layout.
- [ ] Introduce categories in importance order: General, Writing and signature, Appearance, Privacy, Rules, Data and diagnostics, Updates, Account.
- [ ] Render one category page at a time while preserving all current controls and state.
- [ ] Add responsive CSS that collapses the side navigation to a horizontal category strip in narrow windows.
- [ ] Re-run the settings layout test.

### Task 6: Localization and verification

**Files:**
- Modify: `src/renderer/src/i18n/index.js`
- Modify: `src/renderer/src/i18n/locales.test.mjs`

- [ ] Add all new keys to every supported locale, with native Italian and English wording and safe English fallback wording for the remaining locales.
- [ ] Run `node --test src/renderer/src/i18n/locales.test.mjs`.
- [ ] Run `npm test`.
- [ ] Run `npm run build` only as the final integration verification because the user does not require a build after every change.

No commits are created during execution; the user requested commits only on explicit instruction.
