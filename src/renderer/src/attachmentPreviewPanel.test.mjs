import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('attachment preview is a shared full-panel viewer instead of an overlay modal', async () => {
  const [panel, readingPane, messageViewer] = await Promise.all([
    read('./components/AttachmentPreviewPanel.jsx'),
    read('./components/ReadingPane.jsx'),
    read('./components/MessageViewerApp.jsx')
  ])

  assert.match(panel, /attachment-preview\$\{standalone/)
  assert.match(panel, /attachment-preview__toolbar/)
  assert.match(panel, /attachment-preview__content/)
  assert.match(readingPane, /<AttachmentPreviewPanel/)
  assert.match(messageViewer, /<AttachmentPreviewPanel/)
  assert.doesNotMatch(readingPane, /image-preview-overlay/)
  assert.doesNotMatch(messageViewer, /image-preview-overlay/)
})

test('both attachment lists show and lock a spinner during preview or download work', async () => {
  const [readingPane, messageViewer] = await Promise.all([
    read('./components/ReadingPane.jsx'),
    read('./components/MessageViewerApp.jsx')
  ])

  for (const source of [readingPane, messageViewer]) {
    assert.match(source, /loadingIdx === i/)
    assert.match(source, /spinner spinner--sm/)
    assert.match(source, /disabled=\{loading\}/)
    assert.match(source, /setLoadingIdx\(idx\)/)
  }
})
