import { dequeuePendingOperations, markSyncOperationCompleted, markSyncOperationFailed } from './syncQueue.js'
import { logSync, logErr } from './logger.js'
import { sendEmail } from './smtp/index.js'
import { getCredentials } from './auth/index.js'

let runnerInterval = null

export function startSyncRunner(imapClients) {
  if (runnerInterval) return
  runnerInterval = setInterval(() => runOnce(imapClients).catch(() => {}), 10000)
  logSync('[SyncRunner] Started — polling every 10s')
}

export function stopSyncRunner() {
  if (runnerInterval) {
    clearInterval(runnerInterval)
    runnerInterval = null
    logSync('[SyncRunner] Stopped')
  }
}

async function runOnce(imapClients) {
  const pending = dequeuePendingOperations()
  if (!pending.length) return

  // Group by account, process up to 3 per account concurrently
  const byAccount = {}
  for (const op of pending) {
    const key = op.account_email || '__unknown__'
    if (!byAccount[key]) byAccount[key] = []
    byAccount[key].push(op)
  }

  const tasks = []
  for (const ops of Object.values(byAccount)) {
    for (const op of ops.slice(0, 3)) {
      tasks.push(processOne(op, imapClients))
    }
  }

  await Promise.allSettled(tasks)
}

async function processOne(op, imapClients) {
  try {
    await dispatch(op, imapClients)
    markSyncOperationCompleted(op.id)
    logSync(`[SyncRunner] Completed ${op.operation} (id=${op.id})`)
  } catch (err) {
    logErr(`[SyncRunner] Failed ${op.operation} (id=${op.id}): ${err.message}`)
    markSyncOperationFailed(op.id, err.message)
  }
}

async function dispatch(op, imapClients) {
  const { operation, data, account_email, folder, uid } = op
  const client = imapClients.get(account_email)

  switch (operation) {
    case 'setFlags': {
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.setFlag(folder, uid, data.flag, data.add)
      break
    }
    case 'moveMessage': {
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.moveMessage(folder, uid, data.destination)
      break
    }
    case 'deleteMessage': {
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.deleteMessage(folder, uid, data.permanent)
      break
    }
    case 'markJunk': {
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.markJunk(folder, uid, data.isJunk)
      break
    }
    case 'bulkSetFlags': {
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.bulkSetFlag(folder, data.uids, data.flag, data.add)
      break
    }
    case 'bulkDelete': {
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.bulkDelete(folder, data.uids)
      break
    }
    case 'bulkMove': {
      if (!client) throw new Error(`No IMAP client for ${account_email}`)
      await client.bulkMove(folder, data.uids, data.destination)
      break
    }
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
