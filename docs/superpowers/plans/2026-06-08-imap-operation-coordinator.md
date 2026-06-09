# IMAP Operation Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serialize single-account IMAP work and improve sync operation events so connection drops do not create overlapping operations or unhandled promise rejections.

**Architecture:** Add a small coordinator module in `src/main/imap/operationCoordinator.js`. Wire main-process IPC and sync queue dispatch through that coordinator while keeping the existing `ImapClient` API intact.

**Tech Stack:** Electron main process, JavaScript ESM, `node:test`, existing `imapflow` client wrapper and `sql.js` queue.

---

## File Map

- Create `src/main/imap/operationCoordinator.js`: FIFO operation chain, connection gate, transient error classification, structured event emitter.
- Create `src/main/imap/operationCoordinator.test.mjs`: unit tests for coordinator behavior.
- Modify `src/main/index.js`: instantiate coordinator, update client connection state, route direct IMAP IPC through coordinator, expose `sync:operation-update`.
- Modify `src/main/syncRunner.js`: process pending IMAP queue items through coordinator sequentially.
- Modify `src/main/syncQueue.js`: emit structured operation update events alongside existing generic start/end events.
- Modify `src/preload/index.js`: allow renderer subscriptions to `sync:operation-update`.

## Tasks

### Task 1: Coordinator Tests

- [x] Write tests in `src/main/imap/operationCoordinator.test.mjs` covering serialization, reconnect waiting, transient classification, and chain recovery.
- [x] Run `node --test src/main/imap/operationCoordinator.test.mjs` and confirm the tests fail because the module does not exist.

### Task 2: Coordinator Implementation

- [x] Create `src/main/imap/operationCoordinator.js` with `ImapOperationCoordinator` and `isTransientImapError`.
- [x] Run `node --test src/main/imap/operationCoordinator.test.mjs` and confirm all tests pass.

### Task 3: Queue Wiring

- [x] Update `syncRunner.js` so IMAP operations call `coordinator.runQueuedOperation(op, () => dispatch(...))` and are processed FIFO for the single account.
- [x] Keep `sendEmail` outside the IMAP coordinator.
- [x] Run coordinator tests again.

### Task 4: Direct IPC Wiring

- [x] Update `index.js` to create one coordinator.
- [x] Route direct remote calls through `imapCoordinator.runDirect(...)`: `syncInbox`, `syncFolder`, `markAllRead`, `emptyFolder`, and attachment downloads.
- [x] Update connection-status listener to call `imapCoordinator.setConnectionStatus(status)`.
- [x] Run coordinator tests again.

### Task 5: Structured Events

- [x] Add `emitSyncOperationUpdate` helper to `syncQueue.js`.
- [x] Emit `queued`, `running`, `retrying`, `completed`, and `failed` states where data is already known.
- [x] Allow `sync:operation-update` in `src/preload/index.js`.
- [x] Run build.

### Task 6: Verification

- [x] Run `node --test src/main/imap/operationCoordinator.test.mjs`.
- [x] Run `npm.cmd run build`.
- [x] Check `git status --short`.
