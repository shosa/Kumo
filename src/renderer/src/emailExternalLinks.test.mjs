import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const components = [
  'ReadingPane.jsx',
  'MessageViewerApp.jsx'
]

for (const component of components) {
  test(`${component} opens email links outside the sandboxed iframe`, async () => {
    const source = await readFile(
      new URL(`./components/${component}`, import.meta.url),
      'utf8'
    )

    assert.match(source, /addEventListener\('click'/)
    assert.match(source, /type:\s*'kumo-email-open-link'/)
    assert.match(source, /window\.api\.shell\.openExternal\(event\.data\.url\)/)
  })
}
