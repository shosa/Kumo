# Kumo Unified Productivity Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global search, activity history, local appointment detection, and a relationship-rich contact view.

**Architecture:** Add focused main-process query and activity modules over the existing SQL.js
store, expose them through preload IPC, and render the features as native React views. Keep
appointment extraction and result grouping as pure tested modules.

**Tech Stack:** Electron, React, SQL.js, Node test runner, existing Kumo CSS and i18n.

---

### Task 1: Shared Data Foundations

**Files:**
- Modify: `src/main/store/db.js`
- Create: `src/main/activityStore.js`
- Test: `src/main/activityStore.test.mjs`

- [ ] Add the activity table migration and bounded CRUD helpers.
- [ ] Add parameterized cross-entity search and contact relationship queries.
- [ ] Run focused database-independent policy tests.

### Task 2: Global Search

**Files:**
- Create: `src/main/globalSearch.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/index.js`
- Modify: `src/renderer/src/components/CommandPalette.jsx`
- Test: `src/main/globalSearch.test.mjs`

- [ ] Add failing tests for normalization, grouping, and limits.
- [ ] Implement unified search result shaping.
- [ ] Wire IPC and native navigation actions.

### Task 3: Activity Center

**Files:**
- Create: `src/renderer/src/components/ActivityCenter.jsx`
- Modify: `src/renderer/src/components/Rail.jsx`
- Modify: `src/renderer/src/App.jsx`
- Modify: `src/main/index.js`
- Modify: `src/main/syncRunner.js`

- [ ] Record structured entries at existing operation boundaries.
- [ ] Add list, clear, metrics, and retry IPC.
- [ ] Build the activity timeline and category navigation.

### Task 4: Appointment Detection

**Files:**
- Create: `src/renderer/src/appointmentDetection.js`
- Test: `src/renderer/src/appointmentDetection.test.mjs`
- Modify: `src/renderer/src/components/ReadingPane.jsx`
- Modify: `src/renderer/src/components/CalendarPanel.jsx`

- [ ] Add failing tests for explicit and relative Italian and English dates.
- [ ] Implement conservative local extraction.
- [ ] Add suggestion, dismiss, and prefilled calendar workflow.

### Task 5: Complete Contact View

**Files:**
- Modify: `src/main/store/db.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/index.js`
- Modify: `src/renderer/src/components/ContactsPanel.jsx`

- [ ] Add bounded relationship queries keyed by normalized email.
- [ ] Expose contact insights through IPC.
- [ ] Add conversations, attachments, events, and quick actions to the detail pane.

### Task 6: Product Integration

**Files:**
- Modify: `src/renderer/src/styles/components.css`
- Modify: `src/renderer/src/locales/*.json`
- Modify: renderer source-level tests

- [ ] Add responsive Kumo-native styling.
- [ ] Add complete localization keys to every locale.
- [ ] Run `npm.cmd test`.
- [ ] Run `.\\node_modules\\.bin\\electron-vite.cmd build`.
- [ ] Run `git diff --check`.
