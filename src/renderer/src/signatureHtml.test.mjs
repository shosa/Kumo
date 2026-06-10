import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSignatureBlock, normalizeSignatureHtml } from './signatureHtml.js'

test('keeps rich signature markup intact', () => {
  assert.equal(
    buildSignatureBlock('<p><strong>Stefano</strong><br><a href="https://kumo.example">Kumo</a></p>'),
    '<p><br></p><div class="kumo-signature"><p><strong>Stefano</strong><br><a href="https://kumo.example">Kumo</a></p></div>'
  )
})

test('treats empty Quill markup as no signature', () => {
  assert.equal(normalizeSignatureHtml('<p><br></p>'), '')
  assert.equal(buildSignatureBlock('<p><br></p>'), '<p><br></p>')
})

