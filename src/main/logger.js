import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { dirname } from 'path'

const RESET   = '\x1b[0m'
const BOLD    = '\x1b[1m'
const DIM     = '\x1b[2m'
const CYAN    = '\x1b[36m'
const GREEN   = '\x1b[32m'
const YELLOW  = '\x1b[33m'
const RED     = '\x1b[31m'
const BLUE    = '\x1b[34m'
const MAGENTA = '\x1b[35m'

const MAX_LOG_BYTES = 2 * 1024 * 1024
let logFilePath = null

const COLORS = {
  SYNC: `${CYAN}${BOLD}`,
  MAIL: `${GREEN}${BOLD}`,
  MOVE: `${YELLOW}${BOLD}`,
  DEL: `${RED}${BOLD}`,
  CARD: `${BLUE}${BOLD}`,
  CAL: `${MAGENTA}${BOLD}`,
  INFO: DIM,
  WARN: YELLOW,
  ERR: RED,
  DEBUG: DIM
}

export function sanitizeLogText(value) {
  return String(value ?? '')
    .replace(/\u2026/g, '...')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2713/g, 'OK')
    .replace(/\u2717/g, 'ERROR')
    .replace(/ÔÇª/g, '...')
    .replace(/ÔÇö/g, '-')
    .replace(/ÔåÆ/g, '->')
    .replace(/\r?\n/g, ' ')
}

function quoteContextValue(value) {
  const text = sanitizeLogText(value)
  if (/^[a-zA-Z0-9_.:@/+\\-]+$/.test(text)) return text
  return `"${text.replace(/"/g, '\\"')}"`
}

export function formatContext(context = {}) {
  return Object.entries(context)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      if (key === 'folder') {
        return `${key}="${sanitizeLogText(value).replace(/"/g, '\\"')}"`
      }
      return `${key}=${quoteContextValue(value)}`
    })
    .join(' ')
}

function localTimestamp(date = new Date()) {
  const pad = (value, size = 2) => String(value).padStart(size, '0')
  return [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(':') + `.${pad(date.getMilliseconds(), 3)}`
}

export function formatLogLine(level, message, context = {}, date = new Date()) {
  const suffix = formatContext(context)
  return `${localTimestamp(date)} [${level}] ${sanitizeLogText(message)}${suffix ? ` | ${suffix}` : ''}`
}

export function initLogger(filePath) {
  logFilePath = filePath || null
  if (!logFilePath) return
  mkdirSync(dirname(logFilePath), { recursive: true })
  rotateLogIfNeeded()
  writeFileLine(formatLogLine('INFO', 'Logger initialized', { file: logFilePath }))
}

export function getLogFilePath() {
  return logFilePath
}

function rotateLogIfNeeded() {
  if (!logFilePath || !existsSync(logFilePath)) return
  try {
    if (statSync(logFilePath).size < MAX_LOG_BYTES) return
    const rotated = `${logFilePath}.1`
    if (existsSync(rotated)) {
      // renameSync replaces the destination on Windows only inconsistently.
      renameSync(rotated, `${rotated}.${Date.now()}`)
    }
    renameSync(logFilePath, rotated)
  } catch {
    // Logging must never interrupt application startup.
  }
}

function writeFileLine(line) {
  if (!logFilePath) return
  try {
    rotateLogIfNeeded()
    appendFileSync(logFilePath, `${line}\n`, 'utf8')
  } catch {
    // Logging failures are non-fatal.
  }
}

function write(level, message, context = {}) {
  const time = localTimestamp()
  const cleanMessage = sanitizeLogText(message)
  const suffix = formatContext(context)
  const line = `${time} [${level}] ${cleanMessage}${suffix ? ` | ${suffix}` : ''}`
  const color = COLORS[level] || ''
  const consoleLine = `${DIM}${time}${RESET} ${color}[${level}]${RESET}  ${cleanMessage}${suffix ? ` ${DIM}| ${suffix}${RESET}` : ''}`

  if (level === 'ERR') console.error(consoleLine)
  else if (level === 'WARN') console.warn(consoleLine)
  else console.log(consoleLine)

  writeFileLine(line)
}

export function logSync(msg, context)    { write('SYNC', msg, context) }
export function logMail(msg, context)    { write('MAIL', msg, context) }
export function logMove(msg, context)    { write('MOVE', msg, context) }
export function logDelete(msg, context)  { write('DEL', msg, context) }
export function logContact(msg, context) { write('CARD', msg, context) }
export function logCal(msg, context)     { write('CAL', msg, context) }
export function logInfo(msg, context)    { write('INFO', msg, context) }
export function logWarn(msg, context)    { write('WARN', msg, context) }
export function logErr(msg, context)     { write('ERR', msg, context) }
export function logDebug(msg, context)   { write('DEBUG', msg, context) }
