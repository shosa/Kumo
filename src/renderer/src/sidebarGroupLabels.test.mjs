import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('smart folders label matches the other sidebar group labels', async () => {
  const sidebar = await readFile(
    new URL('./components/Sidebar.jsx', import.meta.url),
    'utf8'
  )
  const styles = await readFile(
    new URL('./styles/components.css', import.meta.url),
    'utf8'
  )

  assert.match(
    sidebar,
    /<span>\{t\('smart\.title'\)\}<\/span>[\s\S]*?<IconChevronRight/
  )
  assert.match(styles, /\.sidebar__group-toggle\s*\{[\s\S]*?font-family:\s*inherit;/)
  assert.match(styles, /\.sidebar__group-chevron\s*\{[\s\S]*?margin-left:\s*auto;/)
  assert.doesNotMatch(styles, /\.sidebar__group-toggle:hover/)
})
