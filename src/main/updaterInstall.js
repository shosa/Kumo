export function installDownloadedUpdate(autoUpdater, requestExit) {
  requestExit()
  autoUpdater.quitAndInstall(false, true)
}
