import test from 'node:test'
import assert from 'node:assert/strict'
import { createUpdateChecker, resolveAutoUpdaterModule } from './updaterCheck.js'

test('resolves autoUpdater from an ESM named export', () => {
  const autoUpdater = {}
  assert.equal(resolveAutoUpdaterModule({ autoUpdater }), autoUpdater)
})

test('resolves autoUpdater from a CommonJS default export', () => {
  const autoUpdater = {}
  assert.equal(resolveAutoUpdaterModule({ default: { autoUpdater } }), autoUpdater)
})

test('fails clearly when electron-updater has an unexpected module shape', () => {
  assert.throws(
    () => resolveAutoUpdaterModule({ default: {} }),
    /did not expose autoUpdater/
  )
})

test('returns the available version directly from electron-updater result', async () => {
  const checker = createUpdateChecker({
    getAutoUpdater: async () => ({
      checkForUpdates: async () => ({
        isUpdateAvailable: true,
        updateInfo: { version: '2.1.0' }
      })
    })
  })

  assert.deepEqual(await checker.check(), {
    ok: true,
    status: 'available',
    version: '2.1.0'
  })
})

test('returns not-available without relying on a separate event', async () => {
  const checker = createUpdateChecker({
    getAutoUpdater: async () => ({
      checkForUpdates: async () => ({
        isUpdateAvailable: false,
        updateInfo: { version: '2.0.3' }
      })
    })
  })

  assert.deepEqual(await checker.check(), {
    ok: true,
    status: 'not-available',
    version: '2.0.3'
  })
})

test('deduplicates concurrent manual and automatic checks', async () => {
  let calls = 0
  let resolveCheck
  const pending = new Promise(resolve => { resolveCheck = resolve })
  const checker = createUpdateChecker({
    getAutoUpdater: async () => ({
      checkForUpdates: () => {
        calls++
        return pending
      }
    })
  })

  const first = checker.check()
  const second = checker.check()
  resolveCheck({ isUpdateAvailable: false, updateInfo: { version: '2.0.3' } })

  assert.deepEqual(await Promise.all([first, second]), [
    { ok: true, status: 'not-available', version: '2.0.3' },
    { ok: true, status: 'not-available', version: '2.0.3' }
  ])
  assert.equal(calls, 1)
})

test('times out instead of leaving the UI checking forever', async () => {
  const checker = createUpdateChecker({
    getAutoUpdater: async () => ({
      checkForUpdates: () => new Promise(() => {})
    }),
    timeoutMs: 5
  })

  assert.deepEqual(await checker.check(), {
    ok: false,
    code: 'timeout',
    error: 'Update check timed out'
  })
})

test('retries once after a transient check failure', async () => {
  let calls = 0
  const checker = createUpdateChecker({
    getAutoUpdater: async () => ({
      checkForUpdates: async () => {
        calls++
        if (calls === 1) throw new Error('temporary network failure')
        return { isUpdateAvailable: false, updateInfo: { version: '2.0.3' } }
      }
    }),
    retryDelayMs: 0
  })

  assert.equal((await checker.check()).status, 'not-available')
  assert.equal(calls, 2)
})

test('returns a terminal error when the updater provider cannot initialize', async () => {
  const checker = createUpdateChecker({
    getAutoUpdater: async () => { throw new Error('missing update configuration') }
  })

  assert.deepEqual(await checker.check(), {
    ok: false,
    code: 'initialization-failed',
    error: 'missing update configuration'
  })
})
