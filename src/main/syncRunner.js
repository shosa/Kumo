import { dequeuePendingOperations, markSyncOperationCompleted, markSyncOperationFailed } from './syncQueue.js'
import { logSync, logErr } from './logger.js'
import { sendEmail } from './smtp/index.js'
import { getCredentials } from './auth/index.js'

let runnerInterval = null
let runnerPromise = null
let rerunRequested = false

const IMAP_OPERATIONS = new Set([
  'setFlags',
  'moveMessage',
  'deleteMessage',
  'markJunk',
  'bulkSetFlags',
  'bulkDelete',
  'bulkMove'
])

export function startSyncRunner(imapClients, coordinator = null) {
  if (runnerInterval) return
  runnerInterval = setInterval(
    () => triggerRun(imapClients, coordinator),
    10000
  )
  logSync('[SyncRunner] Started - polling every 10s')
}

export async function flushSyncQueue(imapClients, coordinator = null) {
  await triggerRun(imapClients, coordinator)
}

export function stopSyncRunner() {
  if (runnerInterval) {
    clearInterval(runnerInterval)
    runnerInterval = null
    logSync('[SyncRunner] Stopped')
  }
}

function triggerRun(imapClients, coordinator) {
  if (runnerPromise) {
    rerunRequested = true
    return runnerPromise
  }
  runnerPromise = runUntilIdle(imapClients, coordinator)
    .catch(() => {})
    .finally(() => {
      runnerPromise = null
    })
  return runnerPromise
}

async function runUntilIdle(imapClients, coordinator) {
  do {
    rerunRequested = false
    await runOnce(imapClients, coordinator)
  } while (rerunRequested)
}

async function runOnce(imapClients, coordinator) {
  const pending = dequeuePendingOperations()
  if (!pending.length) return

  // Kumo is single-account. Keep all remote IMAP work on one FIFO pipeline.
  for (const op of pending) {
    await processOne(op, imapClients, coordinator)
  }
}

async function processOne(op, imapClients, coordinator) {
  try {
    if (coordinator && IMAP_OPERATIONS.has(op.operation)) {
      await coordinator.runQueuedOperation(op, () => dispatch(op, imapClients))
    } else {
      await dispatch(op, imapClients)
    }
    markSyncOperationCompleted(op.id)
    logSync('Sync runner completed operation', {
      op: op.operation,
      id: op.id,
      folder: op.folder,
      uid: op.uid,
      retry: op.retry_count || 0
    })
  } catch (err) {
    logErr('Sync runner failed operation', {
      op: op.operation,
      id: op.id,
      folder: op.folder,
      uid: op.uid,
      retry: op.retry_count || 0,
      error: err.message
    })
    markSyncOperationFailed(op.id, err.message)
  }
}

async function dispatch(op, imapClients) {
  const { operation, data, account_email, folder, uid } = op
  const client = imapClients.get(account_email)

  switch (operation) {
    case 'setFlags':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.setFlag(folder, uid, data.flag, data.add)
      break
    case 'moveMessage':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.moveMessage(folder, uid, data.destination)
      break
    case 'deleteMessage':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.deleteMessage(folder, uid, data.permanent)
      break
    case 'markJunk':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.markJunk(folder, uid, data.isJunk)
      break
    case 'bulkSetFlags':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.bulkSetFlag(folder, data.uids, data.flag, data.add)
      break
    case 'bulkDelete':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.bulkDelete(folder, data.uids)
      break
    case 'bulkMove':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.bulkMove(folder, data.uids, data.destination)
      break
    case 'sendEmail': {
      const creds = await getCredentials(account_email)
      if (!creds) throw new Error(`No credentials for ${account_email}`)
      await sendEmail(creds.email, creds.password, data.mailOptions)
      break
    }
    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}
