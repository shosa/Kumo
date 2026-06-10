import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const rail = readFileSync(join(root, 'components', 'Rail.jsx'), 'utf8')
const css = readFileSync(join(root, 'styles', 'components.css'), 'utf8')

test('rail navigation buttons keep a stable component identity across sync renders', () => {
  const componentIndex = rail.indexOf('function RailNavButton')
  const railIndex = rail.indexOf('export default function Rail')

  assert.ok(componentIndex >= 0 && componentIndex < railIndex)
  assert.doesNotMatch(rail.slice(railIndex), /const NavBtn\s*=/)
})

test('active rail indicator is aligned to the rail edge and does not restart an entrance animation', () => {
  assert.match(css, /\.rail__btn\.active::before\s*\{[^}]*left:\s*-9px/s)
  assert.doesNotMatch(css, /\.rail__btn\.active::before\s*\{[^}]*animation:/s)
})

test('activity icon uses a smaller optical size beside settings', () => {
  assert.match(rail, /RailNavButton id="activity"[^>]*size=\{19\}/)
  assert.match(rail, /function RailNavButton\(\{[^}]*size = 21/)
})
