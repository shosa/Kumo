import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPreviewableAttachmentIndexes,
  getAdjacentPreviewIndex
} from './attachmentNavigation.js'

const attachments = [
  { filename: 'photo.jpg', type: 'image/jpeg' },
  { filename: 'archive.zip', type: 'application/zip' },
  { filename: 'manual.pdf', type: 'application/pdf' }
]

test('includes images and PDFs in preview navigation', () => {
  assert.deepEqual(getPreviewableAttachmentIndexes(attachments), [0, 2])
})

test('moves within previewable attachments and stops at the ends', () => {
  const indexes = getPreviewableAttachmentIndexes(attachments)
  assert.equal(getAdjacentPreviewIndex(indexes, 0, 1), 2)
  assert.equal(getAdjacentPreviewIndex(indexes, 2, -1), 0)
  assert.equal(getAdjacentPreviewIndex(indexes, 0, -1), null)
  assert.equal(getAdjacentPreviewIndex(indexes, 2, 1), null)
})

