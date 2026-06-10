# Kumo Unified Productivity Features

## Scope

This design adds four connected features:

1. Global search across messages, attachments, contacts, and calendar items.
2. An activity center for synchronization, queued operations, sending, and errors.
3. Local appointment detection in email content with a calendar creation shortcut.
4. A complete contact view joining CardDAV data with related mail, attachments, and events.

The application remains single-account and all indexing and detection happens locally.

## Global Search

The existing command palette becomes the global search entry point. Results are grouped by
type and expose filters for mail, attachments, contacts, and calendar. Selecting a result
navigates to its native view: messages open in mail, contacts open in Contacts, and events
open in Calendar. Attachment results open their parent message.

Search uses existing database tables and FTS data. It does not introduce an external search
service or duplicate message bodies in a new index.

## Activity Center

The rail receives an Activity destination. The center displays a persisted, bounded timeline
with categories, status, summary, detail, timestamps, and optional retry metadata. It also
shows current queue and synchronization metrics.

Existing sync, send, calendar, contact, attachment, and queued-operation boundaries record
structured activity entries. The existing text logger remains unchanged and continues to
serve diagnostics.

## Appointment Detection

When a message body is available, a local detector scans plain text for explicit dates,
relative dates, times, durations, and common meeting locations or links. High-confidence
matches appear as a compact card above the message body.

The user can dismiss the suggestion for the current message or open a prefilled calendar
editor. No event is created without an explicit click. The created event retains a reference
to the source message in its description.

## Contact View

Contacts keep the existing list and editor, while the selected-contact pane gains:

- contact identity and CardDAV fields;
- recent conversations;
- shared attachment count and recent attachments;
- past and upcoming calendar events involving the contact;
- quick compose and navigation actions.

Association is based on normalized email addresses. It does not infer identity from display
names alone.

## Reliability And Privacy

- Queries are parameterized and bounded.
- Activity history has a fixed retention limit.
- Appointment detection never sends message content outside the app.
- Missing related data produces an empty section, not a failed contact page.
- Existing mail, CardDAV, and CalDAV behavior remains authoritative.

## Verification

Pure search grouping, activity retention, appointment parsing, and contact association receive
unit tests. IPC integration and renderer wiring receive source-level regression tests, followed
by the complete Node test suite and an electron-vite build.
