import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mainRoot = path.dirname(fileURLToPath(import.meta.url))
const italianLogWords = /\b(?:avvio|annullato|calendario|caratteri|completato|contatti|errore|eventi|fallita|fallito|falliti|inizio|lette|messaggi|nessun|nessuna|promemoria|provo|ricevuti|rifiutato|rubrica|salvati|salvato|scaricate|scarico|segno|spostate|sposto|svuotato|trovati|trovate|totali)\b/i

async function collectJavaScriptFiles(directory, result = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) await collectJavaScriptFiles(fullPath, result)
    else if (entry.name.endsWith('.js')) result.push(fullPath)
  }
  return result
}

test('main-process logger messages are written in English', async () => {
  const offenders = []
  for (const filePath of await collectJavaScriptFiles(mainRoot)) {
    const source = await readFile(filePath, 'utf8')
    const lines = source.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (/\blog(?:Info|Warn|Err|Debug|Sync|Mail|Move|Delete|Contact|Cal)\s*\(/.test(line) &&
          italianLogWords.test(line)) {
        offenders.push(`${path.relative(mainRoot, filePath)}:${index + 1}: ${line.trim()}`)
      }
    })
  }

  assert.deepEqual(offenders, [])
})
