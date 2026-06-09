# Sender Brand Logos Design

## Goal

Add optional sender logos to received mail while preserving the existing colored
initial avatar as the universal fallback.

The feature is controlled by a new setting that is disabled by default. When it
is disabled, Kumo performs no logo network requests and behaves exactly as it
does today.

## User Experience

- Keep the existing `Show avatars` setting as the master visibility control.
- Add a separate `Sender logos` privacy setting, disabled by default.
- When both settings are enabled, received messages use this priority:
  1. BIMI logo.
  2. Favicon fetched directly from the sender domain.
  3. Existing colored initials.
- Sent, Drafts, and Outbox messages always use the existing recipient initials
  and never trigger logo discovery.
- Apply the same sender avatar behavior in the message list, reading pane, and
  separate message-reading window.
- Switching `Sender logos` off changes visible avatars back to initials
  immediately. Cached files may remain on disk, but are not read or refreshed
  while the setting is disabled.

## Architecture

Logo discovery and downloading live in the Electron main process. The renderer
only asks for a logo for an email/domain and receives a safe local representation
or a cache miss.

The implementation is split into focused units:

- `senderLogoResolver`: normalizes sender domains, applies exclusions, performs
  BIMI and favicon discovery, validates remote destinations, and returns logo
  bytes plus metadata.
- `senderLogoCache`: stores positive and negative domain results with expiry and
  deduplicates concurrent requests for the same domain.
- IPC/preload API: exposes a narrow `getSenderLogo(email)` operation.
- Shared renderer avatar component/hook: renders an image when available and
  falls back to the existing initials without layout changes.

The cache is keyed by normalized registrable sender domain where practical.
Discovery starts from the exact sender domain and may fall back to its parent
domain for common subdomain senders.

## Discovery Flow

1. Reject missing or invalid sender addresses and local-only domains.
2. If the feature setting is disabled, return a disabled result without network
   activity.
3. Read the positive or negative cache.
4. Query `default._bimi.<domain>` for a BIMI TXT record.
5. Parse the BIMI `l=` location and download the referenced SVG when valid.
6. If BIMI is unavailable or unusable, request the sender domain home page and
   inspect standard icon links.
7. If no declared favicon is usable, try `https://<domain>/favicon.ico`.
8. Cache a successful image or a negative result.
9. Return no image on any failure so the renderer keeps colored initials.

BIMI certificate verification is not required for this version. BIMI remains the
highest-priority domain-published asset, while network and content validation
protect the client from unsafe responses.

## Privacy And Security

- Do not use Google Favicon, Clearbit, Gravatar, or any other third-party logo
  aggregation service.
- Make requests only after explicit opt-in.
- Do not include the full email address, message identifiers, account address,
  cookies, or referrer headers in requests.
- Prefer HTTPS. Do not downgrade an HTTPS request to HTTP through redirects.
- Block loopback, private, link-local, multicast, and otherwise non-public IP
  destinations to prevent SSRF.
- Revalidate every redirect target and limit redirect count.
- Enforce short connect/request timeouts and a small maximum response size.
- Accept only supported image content. SVG content is sanitized before exposure
  to the renderer; active content and external references are rejected.
- Never load remote logo URLs directly in renderer `<img>` elements. Return a
  validated local/data representation from the main process.

## Caching And Performance

- Persist successful logos by domain so message lists do not redownload them on
  every launch.
- Persist negative results to avoid repeatedly querying domains without BIMI or
  favicons.
- Use a longer positive TTL and a shorter negative TTL.
- Deduplicate in-flight requests per domain.
- Resolve logos lazily for visible messages rather than blocking folder loading
  or IMAP synchronization.
- Avatar dimensions remain fixed while loading, preventing list layout shifts.
- Reset-all-data removes the sender-logo cache. A dedicated cache-clear action
  is not added in this version.

## Settings And Localization

Add a boolean setting such as `showSenderLogos`, defaulting to `false`.

The setting appears in the Privacy section because enabling it contacts sender
domains. Its label and description explicitly state that Kumo retrieves BIMI
logos or site icons directly from sender domains. All supported locale files
receive the new keys, and locale parity tests continue to pass.

## Failure Handling And Logging

Discovery failures are normal and must not surface as UI errors. They produce
the initials fallback.

Debug logging records:

- normalized domain;
- cache hit, negative hit, or cache expiry;
- selected source (`bimi`, declared favicon, or `/favicon.ico`);
- timeout, invalid record, rejected destination, unsupported content, or size
  limit;
- cache write failures.

Logs never include full sender addresses or downloaded image contents.

## Testing

Unit tests cover:

- email and domain normalization;
- exclusion of Sent, Drafts, and Outbox contexts;
- disabled setting causing zero discovery requests;
- BIMI TXT parsing and priority over favicon;
- declared favicon and `/favicon.ico` fallback order;
- positive and negative cache behavior;
- concurrent request deduplication;
- timeout, redirect, size, content-type, and private-network rejection;
- SVG sanitization;
- renderer fallback to initials and image rendering when a logo is available;
- all locale files containing the new setting keys.

Integration-level tests verify the IPC contract and that the renderer never
receives or loads an unvalidated remote URL.

## Out Of Scope

- Third-party logo providers.
- BIMI VMC/CMC certificate verification.
- Contact photos and per-address user-defined avatars.
- Logos in Sent, Drafts, or Outbox.
- Background crawling of every cached sender domain.
