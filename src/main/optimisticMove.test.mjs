import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOptimisticMovePlan,
  getServerOrphanUids,
  normalizeUidMap
} from './optimisticMove.js'

test('builds collision-safe provisional destination messages', () => {
  const plan = buildOptimisticMovePlan([
    { id: 10, uid: 42, folder: 'INBOX', subject: 'One' },
    { id: 11, uid: 43, folder: 'INBOX', subject: 'Two' }
  ], 'Trash', -5)

  assert.deepEqual(plan.map(item => item.mapping), [
    { sourceUid: 42, provisionalUid: -5, destination: 'Trash' },
    { sourceUid: 43, provisionalUid: -6, destination: 'Trash' }
  ])
  assert.equal(plan[0].optimisticMessage.folder, 'Trash')
  assert.equal(plan[0].optimisticMessage.sync_status, 'pending')
  assert.equal(plan[0].optimisticMessage.id, undefined)
})

test('normalizes UIDPLUS maps returned by IMAP', () => {
  assert.deepEqual(
    [...normalizeUidMap({ 42: 910, 43: 911 })],
    [[42, 910], [43, 911]]
  )
})

test('keeps pending optimistic messages during server reconciliation', () => {
  assert.deepEqual(
    getServerOrphanUids([10, 11, -1], [10], [-1]),
    [11]
  )
})
