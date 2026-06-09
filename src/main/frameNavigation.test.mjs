import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldBlockFrameNavigation } from './frameNavigation.js'

test('allows validated kumo-local attachments inside preview frames', () => {
  assert.equal(
    shouldBlockFrameNavigation('kumo-local:///C:/Users/test/attachments/file.pdf', {
      rendererUrl: null
    }),
    false
  )
})

test('blocks remote frame navigation while allowing renderer-local frames', () => {
  assert.equal(
    shouldBlockFrameNavigation('https://tracker.example/document', {
      rendererUrl: 'http://localhost:5173'
    }),
    true
  )
  assert.equal(
    shouldBlockFrameNavigation('http://localhost:5173/email-frame', {
      rendererUrl: 'http://localhost:5173'
    }),
    false
  )
})
