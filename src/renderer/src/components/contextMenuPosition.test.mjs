import test from 'node:test'
import assert from 'node:assert/strict'
import { getSubmenuPosition } from './contextMenuPosition.js'

const trigger = { left: 200, right: 380, top: 120, bottom: 152 }

test('opens submenu to the right when there is enough viewport space', () => {
  assert.deepEqual(
    getSubmenuPosition(trigger, { width: 190, height: 240 }, { width: 900, height: 700 }),
    { x: 386, y: 116, side: 'right' }
  )
})

test('opens submenu to the left when the right edge would overflow', () => {
  assert.deepEqual(
    getSubmenuPosition(trigger, { width: 190, height: 240 }, { width: 520, height: 700 }),
    { x: 8, y: 116, side: 'left' }
  )
})

test('clamps submenu vertically inside the viewport', () => {
  const lowTrigger = { left: 200, right: 380, top: 620, bottom: 652 }

  assert.deepEqual(
    getSubmenuPosition(lowTrigger, { width: 190, height: 240 }, { width: 900, height: 700 }),
    { x: 386, y: 452, side: 'right' }
  )
})
