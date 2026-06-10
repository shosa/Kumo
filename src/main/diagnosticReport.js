export function buildDiagnosticReportText({
  appVersion = '',
  platform = '',
  locale = '',
  generatedAt = new Date(),
  logs = []
} = {}) {
  const sections = [
    'Kumo diagnostic report',
    `Generated: ${generatedAt.toISOString()}`,
    `Version: ${appVersion}`,
    `Platform: ${platform}`,
    `Locale: ${locale}`,
    '',
    'Contents: application logs and technical metadata.'
  ]

  for (const log of logs) {
    sections.push('', `--- ${log.name} ---`, String(log.content || '').trimEnd())
  }

  return `${sections.join('\n')}\n`
}
