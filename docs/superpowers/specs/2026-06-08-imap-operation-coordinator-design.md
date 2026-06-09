# IMAP Operation Coordinator Design

## Goal

Make Kumo handle mail sync events and user actions predictably in the single-account runtime. The app should not run sync, flag, move, delete, empty-folder, and reconnect-sensitive IMAP work against the same client at the same time.

## Context

The pasted runtime log shows rapid delete and empty-trash actions overlapping with IDLE reconnects and folder sync. The current queue can process up to three operations per account concurrently, while manual sync and `emptyFolder` bypass the same retry path. When iCloud drops the connection, an in-flight sync can surface `Connection not available` as an unhandled promise rejection before retry recovery catches up.

Kumo is single-account. The database may keep `account_email` columns for compatibility, but runtime coordination does not need multi-account abstractions.

## Design

Add one process-wide IMAP operation coordinator. It owns a FIFO promise chain for remote IMAP work. Every mutation and manual folder sync enters that chain, so the main client only handles one remote operation at a time.

The coordinator has a connection state gate. When the app is `connecting` or `reconnecting`, queued operations wait until the state becomes `connected`. If a transient connection error happens during execution, the existing persistent queue keeps the operation pending for retry instead of treating it as a permanent failure.

The coordinator emits structured operation events to the renderer. Existing `sync:operation-start` and `sync:operation-end` events remain for backwards compatibility, and a richer `sync:operation-update` event carries `operation`, `folder`, `uid`, `status`, `retryCount`, and `error`.

## Scope

Implement the coordinator for IMAP-side operations only: `setFlags`, `moveMessage`, `deleteMessage`, `markJunk`, `bulkSetFlags`, `bulkDelete`, `bulkMove`, manual `syncFolder`, `syncInbox`, `markAllRead`, and `emptyFolder`.

Keep SMTP/outbox behavior unchanged except for preserving the existing generic sync events.

Do not change database schema. Do not implement multi-account runtime management.

## Error Handling

Treat `Connection not available`, `Not connected`, socket reset, timeout, closed connection, and unusable-client errors as transient. Persistent queued operations retry using the existing exponential backoff. Direct manual actions return an error response instead of producing unhandled rejections.

## Testing

Add focused `node:test` coverage for the coordinator:

- FIFO serialization, even when operations are started together.
- Waiting while reconnecting and resuming after connected.
- Transient error classification.
- Promise-chain recovery after a failed operation.

Run the new unit tests, then run the production build.
