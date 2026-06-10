export function createAppExitController() {
  let exitRequested = false

  return {
    requestExit() {
      exitRequested = true
    },

    shouldHideToTray(trayAvailable) {
      return Boolean(trayAvailable) && !exitRequested
    }
  }
}

export function normalizeCloseBehavior(value) {
  return value === 'tray' || value === 'quit' ? value : 'ask'
}

export function createWindowCloseHandler({
  exitController,
  hasTray,
  getBehavior,
  showPrompt,
  saveBehavior,
  hideWindow,
  requestExit,
  quitApp
}) {
  let promptOpen = false

  return async function handleWindowClose(event) {
    if (!exitController.shouldHideToTray(hasTray())) return

    event.preventDefault()
    const behavior = normalizeCloseBehavior(getBehavior())

    if (behavior === 'tray') {
      hideWindow()
      return
    }

    if (behavior === 'quit') {
      requestExit()
      quitApp()
      return
    }

    if (promptOpen) return
    promptOpen = true
    try {
      const { response, checkboxChecked } = await showPrompt()
      if (response === 0) {
        if (checkboxChecked) saveBehavior('tray')
        hideWindow()
      } else if (response === 1) {
        if (checkboxChecked) saveBehavior('quit')
        requestExit()
        quitApp()
      }
    } finally {
      promptOpen = false
    }
  }
}
