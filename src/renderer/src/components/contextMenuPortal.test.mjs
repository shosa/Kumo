import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const componentPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'ContextMenu.jsx'
)

test('renders the primary context menu through the app-level portal', () => {
  const source = fs.readFileSync(componentPath, 'utf8')

  assert.match(source, /return createPortal\(/)
  assert.match(source, /document\.querySelector\('\.app-root'\) \|\| document\.body/)
})
