import { ipcMain, app } from 'electron'
import { logDebug, logErr, logInfo } from './logger.js'
import { createUpdateChecker, resolveAutoUpdaterModule } from './updaterCheck.js'
import { installDownloadedUpdate } from './updaterInstall.js'

let _sender = null
let _autoUpdater = null
let _registered = false
let _checkActive = false

function send(event, payload) {
  try { _sender?.send('updater:status', { event, ...payload }) } catch { /* window may be destroyed */ }
}

async function getAutoUpdater() {
  if (_autoUpdater) return _autoUpdater

  const updaterModule = await import('electron-updater')
  const autoUpdater = resolveAutoUpdaterModule(updaterModule)
  if (process.env.ELECTRON_RENDERER_URL) {
    autoUpdater.forceDevUpdateConfig = true
  }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.requestHeaders = {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache'
  }
  autoUpdater.logger = {
    info: message => logInfo('Updater', { message }),
    warn: message => logDebug('Updater warning', { message }),
    error: message => logErr('Updater', { error: message }),
    debug: message => logDebug('Updater', { message })
  }

  autoUpdater.on('checking-for-update', () => { logInfo('Updater checking for updates'); send('checking') })
  autoUpdater.on('update-available',     (info) => { logInfo('Updater found update', { version: info.version }); send('available',   { version: info.version }) })
  autoUpdater.on('update-not-available', (info) => { logInfo('Updater found no update', { version: info?.version }); send('not-available') })
  autoUpdater.on('download-progress',    (p)    => { send('progress', { percent: Math.round(p.percent) }) })
  autoUpdater.on('update-downloaded',    (info) => { logInfo('Updater downloaded update', { version: info.version }); send('downloaded',  { version: info.version }) })
  autoUpdater.on('error',                (err)  => {
    logErr('Updater error', { error: err.message })
    if (!_checkActive) send('error', { message: err.message })
  })

  _autoUpdater = autoUpdater
  return _autoUpdater
}

const updateChecker = createUpdateChecker({
  getAutoUpdater,
  onAttemptError: (error, attempt) => {
    logErr('Updater check attempt failed', { attempt, error: error.message })
  }
})

async function checkForUpdates() {
  _checkActive = true
  try {
    return await updateChecker.check()
  } finally {
    _checkActive = false
  }
}

export function initUpdater(mainWindow, { requestExit = () => {} } = {}) {
  _sender = mainWindow.webContents

  if (!_registered) {
    ipcMain.handle('updater:version', () => app.getVersion())

    ipcMain.handle('updater:check', async () => {
      logInfo('Updater check requested')
      const result = await checkForUpdates()
      if (result.ok) logInfo('Updater check completed', { status: result.status, version: result.version })
      else logErr('Updater check failed', { code: result.code, error: result.error })
      return result
    })

    ipcMain.handle('updater:download', async () => {
      try {
        const au = await getAutoUpdater()
        await au.downloadUpdate()
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    })

    ipcMain.handle('updater:install', async () => {
      const au = await getAutoUpdater()
      installDownloadedUpdate(au, requestExit)
    })

    _registered = true
  }

  if (!process.env.ELECTRON_RENDERER_URL) {
    // Wait for renderer to be fully loaded before first check
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const result = await checkForUpdates()
          if (!result.ok) {
            logErr('Automatic updater check failed', { code: result.code, error: result.error })
          }
        } catch { /* silent — user can check manually */ }
      }, 5_000)
    })
  }
}
