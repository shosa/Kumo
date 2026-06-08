import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function collectSourceFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'locales') continue
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) collectSourceFiles(entryPath, files)
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) files.push(entryPath)
  }
  return files
}

function collectTranslationKeys() {
  const keys = new Set()
  const keyPattern = /\bt\(\s*['"]([^'"]+)['"]/g

  for (const filePath of collectSourceFiles(rendererRoot)) {
    const source = fs.readFileSync(filePath, 'utf8')
    let match
    while ((match = keyPattern.exec(source))) keys.add(match[1])
  }

  return [...keys].sort()
}

for (const localeName of ['en-US', 'it-IT']) {
  test(`${localeName} contains every statically referenced translation key`, () => {
    const localePath = path.join(rendererRoot, 'locales', `${localeName}.json`)
    const locale = JSON.parse(fs.readFileSync(localePath, 'utf8'))
    const missing = collectTranslationKeys().filter(key => !(key in locale))

    assert.deepEqual(missing, [])
  })
}
