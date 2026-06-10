import test from 'node:test'
import assert from 'node:assert/strict'
import { installDownloadedUpdate } from './updaterInstall.js'

test('marks the app for exit before quitAndInstall closes its windows', () => {
  const calls = []

  installDownloadedUpdate({
    quitAndInstall: (...args) => calls.push(['install', ...args])
  }, () => calls.push(['exit']))

  assert.deepEqual(calls, [
    ['exit'],
    ['install', false, true]
  ])
})
