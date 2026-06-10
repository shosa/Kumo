import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'styles', 'components.css'), 'utf8')

test('command palette keeps its search row from shrinking', () => {
  assert.match(css, /\.cmdk__search\s*\{[^}]*flex-shrink:\s*0/s)
  assert.match(css, /\.cmdk__list\s*\{[^}]*min-height:\s*0[^}]*flex:\s*1/s)
})

test('global search keeps its input and chips at a stable height', () => {
  assert.match(css, /\.global-search__box\s*\{[^}]*height:\s*56px[^}]*flex-shrink:\s*0/s)
  assert.match(css, /\.global-search__chips\s*\{[^}]*flex-shrink:\s*0/s)
})
