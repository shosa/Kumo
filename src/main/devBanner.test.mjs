import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { KUMO_BANNER_LINES, printKumoTerminalBanner } from './devBanner.js'

test('prints a rainbow ANSI KUMO banner using only ASCII terminal bytes', () => {
  let output = ''
  printKumoTerminalBanner(text => { output += text })

  assert.doesNotMatch(output, /[^\x00-\x7f]/)
  const blockRuns = KUMO_BANNER_LINES.reduce(
    (total, line) => total + (line.match(/#+/g) || []).length,
    0
  )
  assert.equal((output.match(/\x1b\[48;2;/g) || []).length, blockRuns)
  assert.equal(KUMO_BANNER_LINES.length, 5)
  for (const line of KUMO_BANNER_LINES) assert.match(line, /^[# ]+$/)
})

test('main process prints the terminal banner before logger initialization in development', () => {
  const root = dirname(fileURLToPath(import.meta.url))
  const main = readFileSync(join(root, 'index.js'), 'utf8')
  const bannerCall = main.indexOf('printKumoTerminalBanner()')
  const loggerCall = main.indexOf("initLogger(join(app.getPath('userData'), 'logs', 'kumo.log'))", bannerCall)

  assert.match(main, /process\.env\.ELECTRON_RENDERER_URL/)
  assert.ok(bannerCall >= 0 && loggerCall > bannerCall)
})
