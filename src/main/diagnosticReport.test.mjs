import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDiagnosticReportText } from './diagnosticReport.js'

test('builds a diagnostic report with app metadata and logs only', () => {
  const report = buildDiagnosticReportText({
    appVersion: '2.2.0',
    platform: 'win32',
    locale: 'it-IT',
    logs: [
      { name: 'kumo.log', content: '10:00:00.000 [INFO] Started' },
      { name: 'kumo.log.1', content: '09:00:00.000 [ERR] Previous error' }
    ]
  })

  assert.match(report, /Kumo diagnostic report/)
  assert.match(report, /Version: 2\.2\.0/)
  assert.match(report, /--- kumo\.log ---/)
  assert.match(report, /Previous error/)
  assert.doesNotMatch(report, /message body|password|credential/i)
})

