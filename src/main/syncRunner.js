import {
  dequeuePendingOperations,
  markOptimisticOperationSynced,
  markOutboxEmailFailed,
  markOutboxEmailSent,
  markSyncOperationCompleted,
  markSyncOperationFailed,
  rollbackQueuedOperation
} from './syncQueue.js'
import { logSync, logErr } from './logger.js'
import { sendEmail } from './smtp/index.js'
import { getCredentials } from './auth/index.js'
import {
  getDraft,
  addActivity,
  markDraftSynced,
  reconcileOptimisticMove,
  removeOptimisticMoveCopies
} from './store/db.js'
import { normalizeUidMap } from './optimisticMove.js'

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
  'bulkMove',
  'saveDraft',
  'deleteDraft'
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
  const outboxId = op.target_id || op.data?.outboxId
  try {
    if (coordinator && IMAP_OPERATIONS.has(op.operation)) {
      await coordinator.runQueuedOperation(op, () => dispatch(op, imapClients))
    } else {
      await dispatch(op, imapClients)
    }
    if (op.operation === 'sendEmail' && outboxId) {
      markOutboxEmailSent(outboxId)
      addActivity({
        account_email: op.account_email,
        category: 'send',
        status: 'success',
        title: 'Message sent',
        detail: op.data?.mailOptions?.subject || 'No subject',
        operation: 'sendEmail'
      })
    }
    markOptimisticOperationSynced(op)
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
    const terminal = markSyncOperationFailed(op.id, err.message)
    if (terminal) {
      if (op.operation === 'sendEmail' && outboxId) {
        markOutboxEmailFailed(outboxId, err.message)
        addActivity({
          account_email: op.account_email,
          category: 'send',
          status: 'error',
          title: 'Message send failed',
          detail: err.message,
          operation: 'sendEmail',
          retryable: true
        })
      }
      rollbackQueuedOperation(op, err.message)
    }
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
      await performRemoteMove(client, folder, [uid], data)
      break
    case 'deleteMessage':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      if (data.destination) {
        await performRemoteMove(client, folder, [uid], data)
      } else {
        await client.deleteMessage(folder, uid, true)
        await refreshSourceCounts(client, folder)
      }
      break
    case 'markJunk':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await performRemoteMove(client, folder, [uid], data)
      break
    case 'bulkSetFlags':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.bulkSetFlag(folder, data.uids, data.flag, data.add)
      break
    case 'bulkDelete':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      if (data.destination) {
        await performRemoteMove(client, folder, data.uids, data)
      } else {
        await client.bulkDelete(folder, data.uids)
        await refreshSourceCounts(client, folder)
      }
      break
    case 'bulkMove':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await performRemoteMove(client, folder, data.uids, data)
      break
    case 'sendEmail': {
      const creds = await getCredentials(account_email)
      if (!creds) throw new Error(`No credentials for ${account_email}`)
      await sendEmail(creds.email, creds.password, data.mailOptions)
      break
    }
    case 'saveDraft': {
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      const draft = getDraft(data.draftId)
      if (!draft) break
      const remote = await client.saveDraft(draft)
      markDraftSynced(draft.id, remote.folder, remote.uid)
      break
    }
    case 'deleteDraft':
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.deleteRemoteDraft(data.remoteFolder, data.remoteUid)
      break
    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

async function performRemoteMove(client, folder, uids, data) {
  const result = uids.length === 1
    ? await client.moveMessage(folder, uids[0], data.destination)
    : await client.bulkMove(folder, uids, data.destination)

  try {
    const uidMap = normalizeUidMap(result?.uidMap)
    reconcileOptimisticMove(data.optimisticMessages || [], uidMap)
    removeOptimisticMoveCopies(
      (data.optimisticMessages || []).filter(mapping =>
        !uidMap.has(Number(mapping.sourceUid))
      )
    )
  } catch (error) {
    logErr('Could not reconcile optimistic UID mapping', {
      folder,
      destination: data.destination,
      error: error.message
    })
  }

  try {
    await client._syncFolder(data.destination, true)
    await refreshSourceCounts(client, folder)
  } catch (error) {
    logErr('Post-move folder refresh deferred', {
      folder,
      destination: data.destination,
      error: error.message
    })
  }
}

async function refreshSourceCounts(client, folder) {
  try {
    await client._syncFolderCounts(folder)
  } catch { /* next folder sync will reconcile counts */ }
}
