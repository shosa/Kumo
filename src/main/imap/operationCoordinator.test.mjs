import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ImapOperationCoordinator,
  isTransientImapError
} from './operationCoordinator.js'

test('serializes operations in FIFO order', async () => {
  const coordinator = new ImapOperationCoordinator()
  coordinator.setConnectionStatus('connected')
  const events = []

  const first = coordinator.runDirect(
    { operation: 'first', folder: 'INBOX' },
    async () => {
      events.push('first:start')
      await new Promise(resolve => setTimeout(resolve, 20))
      events.push('first:end')
    }
  )
  const second = coordinator.runDirect(
    { operation: 'second', folder: 'INBOX' },
    async () => {
      events.push('second:start')
      events.push('second:end')
    }
  )

  await Promise.all([first, second])

  assert.deepEqual(events, [
    'first:start',
    'first:end',
    'second:start',
    'second:end'
  ])
})

test('waits for a connected state before starting queued work', async () => {
  const coordinator = new ImapOperationCoordinator()
  coordinator.setConnectionStatus('reconnecting')
  let started = false

  const pending = coordinator.runDirect(
    { operation: 'syncFolder', folder: 'INBOX' },
    async () => {
      started = true
      return 'done'
    }
  )

  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(started, false)

  coordinator.setConnectionStatus('connected')
  assert.equal(await pending, 'done')
  assert.equal(started, true)
})

test('releases waiting work when connection becomes disconnected', async () => {
  const coordinator = new ImapOperationCoordinator()
  coordinator.setConnectionStatus('connecting')
  let started = false

  const pending = coordinator.runDirect(
    { operation: 'syncFolder', folder: 'INBOX' },
    async () => {
      started = true
      throw new Error('Not connected')
    }
  )

  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(started, false)

  coordinator.setConnectionStatus('disconnected')
  await assert.rejects(pending, /Not connected/)
  assert.equal(started, true)
})

test('continues processing after an operation rejects', async () => {
  const coordinator = new ImapOperationCoordinator()
  coordinator.setConnectionStatus('connected')

  await assert.rejects(
    coordinator.runDirect(
      { operation: 'failing', folder: 'INBOX' },
      async () => {
        throw new Error('boom')
      }
    ),
    /boom/
  )

  const result = await coordinator.runDirect(
    { operation: 'next', folder: 'INBOX' },
    async () => 'recovered'
  )

  assert.equal(result, 'recovered')
})

test('emits wait and duration metadata for operation diagnostics', async () => {
  const coordinator = new ImapOperationCoordinator()
  coordinator.setConnectionStatus('connected')
  const updates = []
  coordinator.on('operation-update', update => updates.push(update))

  await coordinator.runDirect(
    { operation: 'syncFolder', folder: 'INBOX' },
    async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  )

  assert.equal(updates[0].status, 'running')
  assert.equal(typeof updates[0].waitMs, 'number')
  assert.equal(updates[1].status, 'completed')
  assert.equal(typeof updates[1].durationMs, 'number')
  assert.ok(updates[1].durationMs >= 0)
})

test('classifies connection failures as transient', () => {
  const transientMessages = [
    'Connection not available',
    'Not connected',
    'read ECONNRESET',
    'socket hang up',
    'Connection closed',
    'request timeout',
    'Client is not usable'
  ]

  for (const message of transientMessages) {
    assert.equal(isTransientImapError(new Error(message)), true, message)
  }
  assert.equal(isTransientImapError(new Error('Permission denied')), false)
})
