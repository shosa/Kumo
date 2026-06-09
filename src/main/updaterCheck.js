function delay(ms) {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withTimeout(promise, timeoutMs) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Update check timed out')
      error.code = 'timeout'
      reject(error)
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function normalizeResult(result) {
  if (!result) return { ok: false, code: 'disabled', error: 'Updater is not available' }
  return {
    ok: true,
    status: result.isUpdateAvailable ? 'available' : 'not-available',
    version: result.updateInfo?.version || result.versionInfo?.version || ''
  }
}

export function resolveAutoUpdaterModule(moduleNamespace) {
  const autoUpdater = moduleNamespace?.autoUpdater || moduleNamespace?.default?.autoUpdater
  if (!autoUpdater) {
    throw new Error('electron-updater did not expose autoUpdater')
  }
  return autoUpdater
}

export function createUpdateChecker({
  getAutoUpdater,
  timeoutMs = 20_000,
  retryDelayMs = 1_000,
  onAttemptError = () => {}
}) {
  let inFlight = null

  async function run() {
    let autoUpdater
    try {
      autoUpdater = await getAutoUpdater()
    } catch (error) {
      return {
        ok: false,
        code: 'initialization-failed',
        error: error.message || 'Updater initialization failed'
      }
    }
    if (!autoUpdater) return { ok: false, code: 'disabled', error: 'Updater disabled in development' }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return normalizeResult(
          await withTimeout(autoUpdater.checkForUpdates(), timeoutMs)
        )
      } catch (error) {
        if (error.code === 'timeout') {
          return { ok: false, code: 'timeout', error: error.message }
        }
        onAttemptError(error, attempt)
        if (attempt === 2) {
          return { ok: false, code: 'check-failed', error: error.message || 'Update check failed' }
        }
        await delay(retryDelayMs)
      }
    }
  }

  return {
    check() {
      if (inFlight) return inFlight
      inFlight = run().finally(() => { inFlight = null })
      return inFlight
    }
  }
}
