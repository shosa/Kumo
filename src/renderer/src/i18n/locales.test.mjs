import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesRoot = path.join(rendererRoot, 'locales')

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

function collectLocaleNames() {
  return fs.readdirSync(localesRoot)
    .filter(fileName => fileName.endsWith('.json'))
    .map(fileName => path.basename(fileName, '.json'))
    .sort()
}

function collectPlaceholders(value) {
  return [...String(value).matchAll(/\{\d+\}/g)].map(match => match[0]).sort()
}

const translationKeys = collectTranslationKeys()
const localeNames = collectLocaleNames()
const baseLocale = JSON.parse(fs.readFileSync(path.join(localesRoot, 'en-US.json'), 'utf8'))

test('discovers every locale file', () => {
  assert.deepEqual(localeNames, [
    'de-DE', 'en-US', 'es-ES', 'fr-FR', 'it-IT', 'ja-JP',
    'ko-KR', 'nl-NL', 'pt-BR', 'ru-RU', 'tr-TR', 'zh-CN'
  ])
})

for (const localeName of localeNames) {
  test(`${localeName} contains every statically referenced translation key`, () => {
    const localePath = path.join(localesRoot, `${localeName}.json`)
    const locale = JSON.parse(fs.readFileSync(localePath, 'utf8'))
    const missing = translationKeys.filter(key => !(key in locale))

    assert.deepEqual(missing, [])
  })

  test(`${localeName} preserves translation placeholders`, () => {
    const localePath = path.join(localesRoot, `${localeName}.json`)
    const locale = JSON.parse(fs.readFileSync(localePath, 'utf8'))
    const mismatches = translationKeys.filter(key =>
      JSON.stringify(collectPlaceholders(locale[key])) !==
      JSON.stringify(collectPlaceholders(baseLocale[key]))
    )

    assert.deepEqual(mismatches, [])
  })
}
