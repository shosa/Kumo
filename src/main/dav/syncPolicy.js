export function getCalendarsToReplace({ succeededHrefs = [], failedHrefs = [], disabledHrefs = [] }) {
  const failed = new Set(failedHrefs)
  return [...new Set([...succeededHrefs.filter(href => !failed.has(href)), ...disabledHrefs])]
}

export function getContactsToDelete(localContacts, remoteContacts, failedHrefs = []) {
  if (failedHrefs.length > 0) return []
  const remoteIds = new Set(remoteContacts.map(contact => contact.id))
  return localContacts
    .filter(contact => contact.source === 'carddav' || !contact.source)
    .filter(contact => !remoteIds.has(contact.id))
    .map(contact => contact.id)
}

export function shouldDisplayCalendarItem(item, sources) {
  if (!item.calendar_href || sources.length === 0) return true
  return sources.some(source => source.enabled && source.href === item.calendar_href)
}
