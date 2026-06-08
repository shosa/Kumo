import {
  clearFailedOperations,
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
import { reconcileOptimisticMove, removeOptimisticMoveCopies } from './store/db.js'
import { normalizeUidMap } from './optimisticMove.js'

// Startup sync: replay pending sync operations on app start
export async function replayPendingSyncOperations(imapClients, coordinator = null) {
  logSync('[StartupSync] Starting replay of pending sync operations...')

  // Clear operations that have failed too many times
  clearFailedOperations()

  const pendingOperations = dequeuePendingOperations()
  if (pendingOperations.length === 0) {
    logSync('[StartupSync] No pending sync operations')
    return
  }

  logSync(`[StartupSync] Found ${pendingOperations.length} pending operations`)

  for (const op of pendingOperations) {
    const outboxId = op.target_id || op.data?.outboxId
    try {
      if (coordinator && op.operation !== 'sendEmail') {
        await coordinator.runQueuedOperation(op, () => processSyncOperation(op, imapClients))
      } else {
        await processSyncOperation(op, imapClients)
      }
      if (op.operation === 'sendEmail' && outboxId) {
        markOutboxEmailSent(outboxId)
      }
      markOptimisticOperationSynced(op)
      markSyncOperationCompleted(op.id)
      logSync('Startup sync completed operation', {
        op: op.operation,
        target: op.target_type,
        id: op.id,
        folder: op.folder,
        uid: op.uid
      })
    } catch (err) {
      logErr('Startup sync failed operation', {
        op: op.operation,
        target: op.target_type,
        id: op.id,
        folder: op.folder,
        uid: op.uid,
        error: err.message
      })
      const terminal = markSyncOperationFailed(op.id, err.message)
      if (terminal) {
        if (op.operation === 'sendEmail' && outboxId) {
          markOutboxEmailFailed(outboxId, err.message)
        }
        rollbackQueuedOperation(op, err.message)
      }
    }
  }

  logSync('[StartupSync] Completed replay of pending sync operations')
}

async function processSyncOperation(operation, imapClients) {
  const { operation: opType, target_type, data, account_email, folder, uid } = operation

  switch (opType) {
    case 'setFlags':
      await processSetFlags(data, account_email, folder, uid, imapClients)
      break

    case 'moveMessage':
      await processMoveMessage(data, account_email, folder, uid, imapClients)
      break

    case 'deleteMessage':
      await processDeleteMessage(data, account_email, folder, uid, imapClients)
      break

    case 'markJunk':
      await processMarkJunk(data, account_email, folder, uid, imapClients)
      break

    case 'sendEmail':
      await processSendEmail(data, account_email)
      break

    case 'bulkSetFlags':
      await processBulkSetFlags(data, account_email, folder, imapClients)
      break

    case 'bulkDelete':
      await processBulkDelete(data, account_email, folder, imapClients)
      break

    case 'bulkMove':
      await processBulkMove(data, account_email, folder, imapClients)
      break

    default:
      throw new Error(`Unknown sync operation: ${opType}`)
  }
}

async function processSetFlags(data, accountEmail, folder, uid, imapClients) {
  const client = imapClients.get(accountEmail)
  if (!client) throw new Error(`No IMAP client for ${accountEmail}`)

  const { flag, add } = data
  await client.setFlag(folder, uid, flag, add)
}

async function processMoveMessage(data, accountEmail, folder, uid, imapClients) {
  const client = imapClients.get(accountEmail)
  if (!client) throw new Error(`No IMAP client for ${accountEmail}`)

  await performRemoteMove(client, folder, [uid], data)
}

async function processDeleteMessage(data, accountEmail, folder, uid, imapClients) {
  const client = imapClients.get(accountEmail)
  if (!client) throw new Error(`No IMAP client for ${accountEmail}`)

  if (data.destination) {
    await performRemoteMove(client, folder, [uid], data)
  } else {
    await client.deleteMessage(folder, uid, true)
    await refreshSourceCounts(client, folder)
  }
}

async function processMarkJunk(data, accountEmail, folder, uid, imapClients) {
  const client = imapClients.get(accountEmail)
  if (!client) throw new Error(`No IMAP client for ${accountEmail}`)

  await performRemoteMove(client, folder, [uid], data)
}

async function processSendEmail(data, accountEmail) {
  const creds = await getCredentials(accountEmail)
  if (!creds) throw new Error(`No credentials found for ${accountEmail}`)
  await sendEmail(creds.email, creds.password, data.mailOptions)
}

async function processBulkSetFlags(data, accountEmail, folder, imapClients) {
  const client = imapClients.get(accountEmail)
  if (!client) throw new Error(`No IMAP client for ${accountEmail}`)
  await client.bulkSetFlag(folder, data.uids, data.flag, data.add)
}

async function processBulkDelete(data, accountEmail, folder, imapClients) {
  const client = imapClients.get(accountEmail)
  if (!client) throw new Error(`No IMAP client for ${accountEmail}`)
  if (data.destination) {
    await performRemoteMove(client, folder, data.uids, data)
  } else {
    await client.bulkDelete(folder, data.uids)
    await refreshSourceCounts(client, folder)
  }
}

async function processBulkMove(data, accountEmail, folder, imapClients) {
  const client = imapClients.get(accountEmail)
  if (!client) throw new Error(`No IMAP client for ${accountEmail}`)
  await performRemoteMove(client, folder, data.uids, data)
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
    logErr('Could not reconcile optimistic UID mapping during startup', {
      folder,
      destination: data.destination,
      error: error.message
    })
  }

  try {
    await client._syncFolder(data.destination, true)
    await refreshSourceCounts(client, folder)
  } catch (error) {
    logErr('Post-move startup refresh deferred', {
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
