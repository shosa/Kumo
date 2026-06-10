import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCalendarsToReplace,
  getContactsToDelete,
  shouldDisplayCalendarItem
} from './dav/syncPolicy.js'

test('replaces only calendars whose complete sync succeeded', () => {
  const result = getCalendarsToReplace({
    succeededHrefs: ['https://caldav.icloud.com/good/'],
    failedHrefs: ['https://caldav.icloud.com/failed/'],
    disabledHrefs: ['https://caldav.icloud.com/disabled/']
  })

  assert.deepEqual(result, [
    'https://caldav.icloud.com/good/',
    'https://caldav.icloud.com/disabled/'
  ])
})

test('deletes missing contacts only after every address book succeeded', () => {
  const local = [{ id: 'keep' }, { id: 'removed' }]
  const remote = [{ id: 'keep' }]

  assert.deepEqual(getContactsToDelete(local, remote, []), ['removed'])
  assert.deepEqual(getContactsToDelete(local, remote, ['https://contacts.icloud.com/failed/']), [])
})

test('does not display calendar items when all loaded sources are disabled', () => {
  const sources = [{ href: 'a', enabled: 0 }, { href: 'b', enabled: 0 }]
  assert.equal(shouldDisplayCalendarItem({ calendar_href: 'a' }, sources), false)
  assert.equal(shouldDisplayCalendarItem({ calendar_href: null }, sources), true)
})
