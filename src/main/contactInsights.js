export function normalizeContactEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function extractAddresses(value) {
  if (Array.isArray(value)) return value.flatMap(extractAddresses)
  const text = String(value || '')
  return [...text.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)]
    .map(match => normalizeContactEmail(match[0]))
}

export function messageMatchesContact(message, email) {
  const target = normalizeContactEmail(email)
  if (!target) return false
  return [
    message.from_email,
    message.to_addresses,
    message.cc_addresses,
    message.bcc_addresses
  ].flatMap(extractAddresses).includes(target)
}

export function eventMatchesContact(event, email) {
  const target = normalizeContactEmail(email)
  if (!target) return false
  return [event.organizer, event.attendees]
    .flatMap(value => {
      if (Array.isArray(value)) return value.flatMap(item => extractAddresses(item?.email || item))
      if (value && typeof value === 'object') return extractAddresses(value.email || value.value)
      return extractAddresses(value)
    })
    .includes(target)
}
