import { ipcMain, app } from 'electron'

let _sender = null
let _autoUpdater = null
let _registered = false

function send(event, payload) {
  try { _sender?.send('updater:status', { event, ...payload }) } catch { /* window may be destroyed */ }
}

async function getAutoUpdater() {
  if (_autoUpdater) return _autoUpdater
  if (process.env.ELECTRON_RENDERER_URL) return null

  const { autoUpdater } = await import('electron-updater')
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null // disable file logging; we relay via IPC

  autoUpdater.on('checking-for-update', () => { console.log('[Updater] checking-for-update'); send('checking') })
  autoUpdater.on('update-available',     (info) => { console.log('[Updater] update-available', info.version); send('available',   { version: info.version }) })
  autoUpdater.on('update-not-available', (info) => { console.log('[Updater] update-not-available', info?.version); send('not-available') })
  autoUpdater.on('download-progress',    (p)    => { send('progress', { percent: Math.round(p.percent) }) })
  autoUpdater.on('update-downloaded',    (info) => { console.log('[Updater] update-downloaded', info.version); send('downloaded',  { version: info.version }) })
  autoUpdater.on('error',                (err)  => { console.error('[Updater] error', err.message); send('error', { message: err.message }) })

  _autoUpdater = autoUpdater
  return _autoUpdater
}

export function initUpdater(mainWindow) {
  _sender = mainWindow.webContents

  if (!_registered) {
    ipcMain.handle('updater:version', () => app.getVersion())

    ipcMain.handle('updater:check', async () => {
      try {
        const au = await getAutoUpdater()
        if (!au) { console.log('[Updater] disabled in dev'); return { ok: false, error: 'Updater disabled in development' } }
        console.log('[Updater] checkForUpdates() called')
        await au.checkForUpdates()
        console.log('[Updater] checkForUpdates() resolved')
        return { ok: true }
      } catch (err) {
        console.error('[Updater] checkForUpdates() threw:', err.message)
        return { ok: false, error: err.message }
      }
    })

    ipcMain.handle('updater:download', async () => {
      try {
        const au = await getAutoUpdater()
        if (!au) return { ok: false, error: 'Updater disabled in development' }
        await au.downloadUpdate()
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    })

    ipcMain.handle('updater:install', async () => {
      const au = await getAutoUpdater()
      au?.quitAndInstall(false, true)
    })

    _registered = true
  }

  if (!process.env.ELECTRON_RENDERER_URL) {
    // Wait for renderer to be fully loaded before first check
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const au = await getAutoUpdater()
          await au?.checkForUpdates()
        } catch { /* silent — user can check manually */ }
      }, 5_000)
    })
  }
}
