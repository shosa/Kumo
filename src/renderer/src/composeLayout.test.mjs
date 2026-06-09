import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(root, 'styles', 'components.css'), 'utf8')
const composeWindow = readFileSync(join(root, 'components', 'ComposeWindow.jsx'), 'utf8')
const composeViewer = readFileSync(join(root, 'components', 'ComposeViewerApp.jsx'), 'utf8')
const quotedPreview = readFileSync(join(root, 'components', 'QuotedMessagePreview.jsx'), 'utf8')

test('both composers keep Quill and the quoted message in one bounded scroll viewport', () => {
  for (const source of [composeWindow, composeViewer]) {
    assert.match(source, /className="compose-editor__content"/)
  }

  assert.match(css, /\.compose-editor__content\s*\{[^}]*overflow-y:\s*auto/s)
  assert.match(css, /\.compose-editor \.ql-toolbar\.ql-snow\s*\{[^}]*position:\s*sticky/s)
  assert.match(css, /\.compose-editor \.ql-editor\s*\{[^}]*overflow:\s*visible/s)
})

test('the quoted preview cannot create a competing vertical scrollbar', () => {
  assert.match(css, /\.compose-quoted-message\s*\{[^}]*overflow:\s*visible/s)
  assert.doesNotMatch(css, /\.compose-quoted-message\s*\{[^}]*max-height:/s)
  assert.match(quotedPreview, /ResizeObserver/)
})

test('CC and BCC fields start collapsed in both composers', () => {
  for (const source of [composeWindow, composeViewer]) {
    assert.match(source, /const \[showCcBcc, setShowCcBcc\] = useState\(false\)/)
    assert.doesNotMatch(source, /if \(mode === 'replyAll'\) setShowCcBcc\(true\)/)
  }
})
