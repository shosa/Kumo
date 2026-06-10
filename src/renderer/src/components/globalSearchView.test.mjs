import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = fs.readFileSync(path.join(root, 'App.jsx'), 'utf8')
const rail = fs.readFileSync(path.join(root, 'components', 'Rail.jsx'), 'utf8')

test('rail search opens the dedicated global search view', () => {
  assert.match(rail, /onClick=\{\(\) => setView\('search'\)\}/)
  assert.match(app, /view === 'search'.*<GlobalSearchPanel/s)
})

test('Ctrl+K remains assigned to the command palette', () => {
  assert.match(app, /e\.key\.toLowerCase\(\) === 'k'[\s\S]*setCmdkOpen/)
  assert.match(app, /<CommandPalette/)
})
