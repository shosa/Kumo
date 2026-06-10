import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAppExitController,
  createWindowCloseHandler,
  normalizeCloseBehavior
} from './appExit.js'

test('normal window close hides to tray while no exit is requested', () => {
  const exit = createAppExitController()

  assert.equal(exit.shouldHideToTray(true), true)
})

test('requested exit allows the window to close instead of hiding to tray', () => {
  const exit = createAppExitController()

  exit.requestExit()

  assert.equal(exit.shouldHideToTray(true), false)
})

test('invalid close preferences fall back to asking', () => {
  assert.equal(normalizeCloseBehavior('unexpected'), 'ask')
  assert.equal(normalizeCloseBehavior('tray'), 'tray')
  assert.equal(normalizeCloseBehavior('quit'), 'quit')
})

test('remembered tray choice hides the window and persists the preference', async () => {
  const calls = []
  const handler = createWindowCloseHandler({
    exitController: createAppExitController(),
    hasTray: () => true,
    getBehavior: () => 'ask',
    showPrompt: async () => ({ response: 0, checkboxChecked: true }),
    saveBehavior: behavior => calls.push(['save', behavior]),
    hideWindow: () => calls.push(['hide']),
    requestExit: () => calls.push(['exit']),
    quitApp: () => calls.push(['quit'])
  })
  const event = { preventDefault: () => calls.push(['prevent']) }

  await handler(event)

  assert.deepEqual(calls, [
    ['prevent'],
    ['save', 'tray'],
    ['hide']
  ])
})

test('remembered quit choice exits completely instead of using the tray', async () => {
  const calls = []
  const exitController = createAppExitController()
  const handler = createWindowCloseHandler({
    exitController,
    hasTray: () => true,
    getBehavior: () => 'ask',
    showPrompt: async () => ({ response: 1, checkboxChecked: true }),
    saveBehavior: behavior => calls.push(['save', behavior]),
    hideWindow: () => calls.push(['hide']),
    requestExit: () => {
      calls.push(['exit'])
      exitController.requestExit()
    },
    quitApp: () => calls.push(['quit'])
  })
  const event = { preventDefault: () => calls.push(['prevent']) }

  await handler(event)

  assert.deepEqual(calls, [
    ['prevent'],
    ['save', 'quit'],
    ['exit'],
    ['quit']
  ])
})

test('stored close behavior bypasses the prompt', async () => {
  const calls = []
  const handler = createWindowCloseHandler({
    exitController: createAppExitController(),
    hasTray: () => true,
    getBehavior: () => 'tray',
    showPrompt: async () => {
      calls.push(['prompt'])
      return { response: 2, checkboxChecked: false }
    },
    saveBehavior: () => {},
    hideWindow: () => calls.push(['hide']),
    requestExit: () => calls.push(['exit']),
    quitApp: () => calls.push(['quit'])
  })

  await handler({ preventDefault: () => calls.push(['prevent']) })

  assert.deepEqual(calls, [
    ['prevent'],
    ['hide']
  ])
})
