import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(root, 'styles', 'components.css'), 'utf8')

test('the standalone message viewer exposes the window background beneath native titlebar controls', () => {
  assert.match(css, /\.viewer-window\s*\{[^}]*background:\s*var\(--bg\)/s)
  assert.match(css, /\.viewer__header\s*\{[^}]*margin-top:\s*32px/s)
  assert.doesNotMatch(css, /\.viewer__header\s*\{[^}]*padding-top:\s*32px/s)
})
