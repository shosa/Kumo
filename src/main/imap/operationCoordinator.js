import { EventEmitter } from 'events'

const WAITING_STATUSES = new Set(['connecting', 'reconnecting'])

export function isTransientImapError(err) {
  const message = String(err?.message || err || '').toLowerCase()
  return [
    'connection not available',
    'not connected',
    'econnreset',
    'socket hang up',
    'connection closed',
    'timeout',
    'not usable',
    'client is not usable'
  ].some(part => message.includes(part))
}

export class ImapOperationCoordinator extends EventEmitter {
  constructor() {
    super()
    this.connectionStatus = 'disconnected'
    this.tail = Promise.resolve()
    this.waiters = new Set()
  }

  setConnectionStatus(status) {
    this.connectionStatus = status || 'disconnected'
    if (!WAITING_STATUSES.has(this.connectionStatus)) {
      const waiters = [...this.waiters]
      this.waiters.clear()
      for (const resolve of waiters) resolve()
    }
  }

  runDirect(meta, fn) {
    return this._enqueue({ ...meta, source: meta?.source || 'direct' }, fn)
  }

  runQueuedOperation(op, fn) {
    return this._enqueue({
      id: op?.id,
      operation: op?.operation,
      folder: op?.folder,
      uid: op?.uid,
      retryCount: op?.retry_count || 0,
      source: 'queue'
    }, fn)
  }

  _enqueue(meta, fn) {
    const queuedAt = Date.now()
    const run = async () => {
      await this._waitUntilReady()
      const startedAt = Date.now()
      this.emit('operation-update', {
        ...meta,
        status: 'running',
        queuedAt,
        startedAt,
        waitMs: startedAt - queuedAt
      })
      try {
        const result = await fn()
        const completedAt = Date.now()
        this.emit('operation-update', {
          ...meta,
          status: 'completed',
          queuedAt,
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt
        })
        return result
      } catch (err) {
        const failedAt = Date.now()
        this.emit('operation-update', {
          ...meta,
          status: 'failed',
          queuedAt,
          startedAt,
          failedAt,
          durationMs: failedAt - startedAt,
          transient: isTransientImapError(err),
          error: err?.message || String(err)
        })
        throw err
      }
    }

    const result = this.tail.then(run, run)
    this.tail = result.catch(() => {})
    return result
  }

  _waitUntilReady() {
    if (!WAITING_STATUSES.has(this.connectionStatus)) return Promise.resolve()
    return new Promise(resolve => this.waiters.add(resolve))
  }
}
