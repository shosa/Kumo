import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('settings uses persistent category navigation and a rich signature editor', async () => {
  const [source, editor] = await Promise.all([
    readFile(new URL('./components/Settings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./components/RichTextEditor.jsx', import.meta.url), 'utf8')
  ])
  assert.match(source, /settings__nav/)
  assert.match(source, /activeCategory/)
  assert.match(source, /categories\.map\(\(\[key, label, CategoryIcon\]\)/)
  assert.match(source, /<CategoryIcon size=\{16\}/)
  assert.match(source, /\['general', t\('settings\.category\.general'\), IconSettings\]/)
  assert.match(source, /\['account', t\('settings\.category\.account'\), IconContacts\]/)
  assert.match(source, /<RichTextEditor/)
  assert.match(source, /store\.exportDiagnostics/)
  const generalPanel = source.slice(
    source.indexOf("activeCategory === 'general'"),
    source.indexOf("activeCategory === 'writing'")
  )
  const accountPanel = source.slice(source.indexOf("activeCategory === 'account'"))
  assert.match(generalPanel, /settings\.language/)
  assert.doesNotMatch(accountPanel, /settings\.language/)
  assert.match(editor, /\{ font: \[\] \}/)
  assert.match(editor, /\{ size: /)
  assert.match(editor, /'code-block'/)
  assert.match(editor, /'video'/)
})
