import { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, shell, dialog, protocol } from 'electron'
import { join, dirname, resolve, sep } from 'path'
import {
  initDB, closeDB, searchMessages, getSettings, saveSetting,
  getFolders, getMessages, getMessageCount,
  clearBodyCache, clearFolderCache, clearMessages, getDbPath, resetAllData,
  clearReclaimableCache, rebuildMailCache, getStorageCounts,
  getDrafts, upsertDraft, deleteDraft, getDraft, findDraftByRemote,
  getThreadMessages, getSmartMessages, getSmartMessageCount,
  getMailRules, saveMailRule, deleteMailRule, messageMatchesRule,
  getSyncState,
  getAttachmentsMeta, markAttachmentDownloaded,
  upsertContact, getContacts, searchContacts, deleteContacts, deleteContact, deleteContactsByIds,
  upsertEvent, getEvents, deleteEvents, deleteEvent, deleteEventsByCalendarHrefs,
  upsertCalendarSource, getCalendarSources, setCalendarSourceEnabled, deleteCalendarSourcesNotIn,
  getAttachmentSnapshots, getMessageSnapshots, moveMessagesOptimistic, removeMessages,
  persistDBImmediate, recalcFolderUnread, getSyncQueueCount,
  getSenderLogoCache, setSenderLogoCache
} from './store/db.js'
import { saveCredentials, getCredentials, deleteCredentials, listStoredEmails } from './auth/index.js'
import { ImapClient } from './imap/client.js'
import { ImapOperationCoordinator } from './imap/operationCoordinator.js'
import { applyFlagChange, parseStoredFlags } from './messageFlags.js'
import { sendEmail } from './smtp/index.js'
import { syncContacts, dumpRawContacts, saveContact, deleteContactRemote } from './carddav/client.js'
import {
  syncCalendar,
  saveCalendarItem,
  deleteCalendarItemRemote,
  sendCalendarReply
} from './caldav/client.js'
import { getCalendarsToReplace, getContactsToDelete } from './dav/syncPolicy.js'
import { initLogger, logContact, logDebug, logErr, logInfo, logSync } from './logger.js'
import { initUpdater } from './updater.js'
import { replayPendingSyncOperations } from './startupSync.js'
import {
  addToOutbox,
  cancelOutboxEmail,
  enqueueSyncOperation,
  markOutboxEmailFailed,
  updateMessageOptimistic
} from './syncQueue.js'
import { startSyncRunner, stopSyncRunner, flushSyncQueue } from './syncRunner.js'
import { APP_NAME, WINDOWS_APP_ID } from './appIdentity.js'
import { createNotificationAvatarBitmap } from './notificationAvatar.js'
import { isLogoExcludedFolder } from './senderLogo.js'
import { createSenderLogoResolver } from './senderLogoResolver.js'
import { isLocalAppUrl, shouldBlockFrameNavigation } from './frameNavigation.js'
import { clearDirectoryContents, getDirectorySize, getFileSize } from './storageFiles.js'
import { printKumoTerminalBanner } from './devBanner.js'
import { createAppExitController, createWindowCloseHandler } from './appExit.js'
import { buildDiagnosticReportText } from './diagnosticReport.js'

// In dev mode, isolate data from the production install
if (process.env.ELECTRON_RENDERER_URL) {
  app.setPath('userData', app.getPath('userData') + '-dev')
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'kumo-local', privileges: { secure: true, stream: true, bypassCSP: true } }
])

app.setName(APP_NAME)
app.setAppUserModelId(WINDOWS_APP_ID)

let mainWindow = null
let tray = null
const appExit = createAppExitController()
const imapCoordinator = new ImapOperationCoordinator()
const imapClients = new Map()   // email → ImapClient
const unreadCounts = new Map()  // email → number
const viewerDataStore = new Map()
let senderLogoResolver = null

function getSubWindowTheme() {
  let theme = 'light'
  try { theme = getSettings().theme || 'light' } catch { /* use default */ }
  if (theme === 'dark') {
    return {
      backgroundColor: '#0e1014',
      titleBarOverlay: { color: '#0e1014', symbolColor: '#6f7686', height: 32 }
    }
  }
  return {
    backgroundColor: '#eceef3',
    titleBarOverlay: { color: '#eceef3', symbolColor: '#8a909d', height: 32 }
  }
}

function getResourcePath(filename) {
  if (process.env.ELECTRON_RENDERER_URL) {
    return join(app.getAppPath(), 'resources', filename)
  }
  return join(process.resourcesPath, 'resources', filename)
}

function requestAppExit() {
  appExit.requestExit()
  if (tray) {
    tray.destroy()
    tray = null
  }
}

const CLOSE_DIALOG_STRINGS = {
  'en-US': {
    title: 'Close Kumo',
    message: 'What should Kumo do when you close the window?',
    detail: 'You can change this later in Settings.',
    tray: 'Minimize to tray',
    quit: 'Close Kumo',
    cancel: 'Cancel',
    remember: "Remember my choice and don't ask again"
  },
  'it-IT': {
    title: 'Chiudi Kumo',
    message: 'Cosa deve fare Kumo quando chiudi la finestra?',
    detail: 'Puoi cambiare questa scelta in seguito dalle Impostazioni.',
    tray: 'Riduci nella tray',
    quit: 'Chiudi Kumo',
    cancel: 'Annulla',
    remember: 'Ricorda la scelta e non chiedere più'
  },
  'de-DE': {
    title: 'Kumo schließen',
    message: 'Was soll Kumo beim Schließen des Fensters tun?',
    detail: 'Sie können diese Auswahl später in den Einstellungen ändern.',
    tray: 'In den Infobereich minimieren',
    quit: 'Kumo schließen',
    cancel: 'Abbrechen',
    remember: 'Auswahl merken und nicht erneut fragen'
  },
  'es-ES': {
    title: 'Cerrar Kumo',
    message: '¿Qué debe hacer Kumo al cerrar la ventana?',
    detail: 'Puedes cambiar esta opción más tarde en Ajustes.',
    tray: 'Minimizar a la bandeja',
    quit: 'Cerrar Kumo',
    cancel: 'Cancelar',
    remember: 'Recordar mi elección y no volver a preguntar'
  },
  'fr-FR': {
    title: 'Fermer Kumo',
    message: 'Que doit faire Kumo lorsque vous fermez la fenêtre ?',
    detail: 'Vous pourrez modifier ce choix ultérieurement dans les paramètres.',
    tray: 'Réduire dans la zone de notification',
    quit: 'Fermer Kumo',
    cancel: 'Annuler',
    remember: 'Mémoriser mon choix et ne plus demander'
  },
  'ja-JP': {
    title: 'Kumoを閉じる',
    message: 'ウィンドウを閉じるとき、Kumoをどうしますか？',
    detail: 'この設定は後で変更できます。',
    tray: 'トレイに最小化',
    quit: 'Kumoを終了',
    cancel: 'キャンセル',
    remember: '選択を記憶して今後確認しない'
  },
  'ko-KR': {
    title: 'Kumo 닫기',
    message: '창을 닫을 때 Kumo를 어떻게 처리할까요?',
    detail: '이 선택은 나중에 설정에서 변경할 수 있습니다.',
    tray: '트레이로 최소화',
    quit: 'Kumo 종료',
    cancel: '취소',
    remember: '선택을 기억하고 다시 묻지 않기'
  },
  'nl-NL': {
    title: 'Kumo sluiten',
    message: 'Wat moet Kumo doen wanneer u het venster sluit?',
    detail: 'U kunt deze keuze later wijzigen in Instellingen.',
    tray: 'Minimaliseren naar systeemvak',
    quit: 'Kumo sluiten',
    cancel: 'Annuleren',
    remember: 'Mijn keuze onthouden en niet opnieuw vragen'
  },
  'pt-BR': {
    title: 'Fechar o Kumo',
    message: 'O que o Kumo deve fazer quando você fechar a janela?',
    detail: 'Você pode alterar esta opção depois nas Configurações.',
    tray: 'Minimizar para a bandeja',
    quit: 'Fechar o Kumo',
    cancel: 'Cancelar',
    remember: 'Lembrar minha escolha e não perguntar novamente'
  },
  'ru-RU': {
    title: 'Закрыть Kumo',
    message: 'Что должен сделать Kumo при закрытии окна?',
    detail: 'Этот выбор можно изменить позже в настройках.',
    tray: 'Свернуть в область уведомлений',
    quit: 'Закрыть Kumo',
    cancel: 'Отмена',
    remember: 'Запомнить выбор и больше не спрашивать'
  },
  'tr-TR': {
    title: "Kumo'yu kapat",
    message: 'Pencere kapatıldığında Kumo ne yapsın?',
    detail: 'Bu seçimi daha sonra Ayarlar bölümünden değiştirebilirsiniz.',
    tray: 'Sistem tepsisine küçült',
    quit: "Kumo'yu kapat",
    cancel: 'İptal',
    remember: 'Seçimimi hatırla ve bir daha sorma'
  },
  'zh-CN': {
    title: '关闭 Kumo',
    message: '关闭窗口时，Kumo 应执行什么操作？',
    detail: '稍后可在设置中更改此选项。',
    tray: '最小化到托盘',
    quit: '关闭 Kumo',
    cancel: '取消',
    remember: '记住我的选择且不再询问'
  }
}

function getCloseDialogStrings() {
  let language = 'en-US'
  try { language = getSettings().language || 'en-US' } catch { /* use default */ }
  return CLOSE_DIALOG_STRINGS[language] || CLOSE_DIALOG_STRINGS['en-US']
}

const handleMainWindowClose = createWindowCloseHandler({
  exitController: appExit,
  hasTray: () => Boolean(tray),
  getBehavior: () => {
    try { return getSettings().closeBehavior } catch { return 'ask' }
  },
  showPrompt: () => {
    const strings = getCloseDialogStrings()
    return dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: [strings.tray, strings.quit, strings.cancel],
      defaultId: 0,
      cancelId: 2,
      title: strings.title,
      message: strings.message,
      detail: strings.detail,
      checkboxLabel: strings.remember,
      checkboxChecked: false,
      noLink: true
    })
  },
  saveBehavior: behavior => saveSetting('closeBehavior', behavior),
  hideWindow: () => mainWindow?.hide(),
  requestExit: requestAppExit,
  quitApp: () => app.quit()
})

function _attachExternalLinkHandler(win) {
  const navigationOptions = { rendererUrl: process.env.ELECTRON_RENDERER_URL }
  const isLocal = (url) => isLocalAppUrl(url, navigationOptions)

  const openUrl = (url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    } else if (url.startsWith('mailto:')) {
      const to = decodeURIComponent(url.replace(/^mailto:/i, '').split('?')[0])
      mainWindow?.webContents.send('open-compose', { mode: 'new', to })
      mainWindow?.show()
      mainWindow?.focus()
    }
  }

  // Intercept target="_blank" / window.open() from renderer and iframes
  win.webContents.setWindowOpenHandler(({ url }) => {
    openUrl(url)
    return { action: 'deny' }
  })

  // Intercept main-frame navigation (e.g. link without target navigating the whole window)
  win.webContents.on('will-navigate', (event, url) => {
    if (!isLocal(url)) {
      event.preventDefault()
      openUrl(url)
    }
  })

  // Intercept iframe navigation (e.g. link clicked inside email body iframe)
  win.webContents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame) {
      if (shouldBlockFrameNavigation(event.url, navigationOptions)) {
        event.preventDefault()
        openUrl(event.url)
      }
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#f5f5f7',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#eceef3',
      symbolColor: '#8a909d',
      height: 32
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    },
    show: true,
    icon: getResourcePath('icon.ico')
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  _attachExternalLinkHandler(mainWindow)

  mainWindow.on('close', (e) => {
    handleMainWindowClose(e).catch(err => {
      logErr('Close behavior dialog failed', { error: err.message })
    })
  })
}

function createTray() {
  const iconPath = getResourcePath('tray-icon.png')
  let icon
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) throw new Error('empty icon')
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  updateTrayMenu()
  tray.setToolTip('Kumo')

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

const TRAY_STRINGS = {
  'en-US': { open: 'Open Kumo', openUnread: n => `Open — ${n} unread`, checkMail: 'Check Mail', quit: 'Quit' },
  'it-IT': { open: 'Apri Kumo', openUnread: n => `Apri — ${n} non letti`, checkMail: 'Controlla posta', quit: 'Esci' },
  'fr-FR': { open: 'Ouvrir Kumo', openUnread: n => `Ouvrir — ${n} non lus`, checkMail: 'Vérifier le courrier', quit: 'Quitter' },
  'de-DE': { open: 'Kumo öffnen', openUnread: n => `Öffnen — ${n} ungelesen`, checkMail: 'E-Mails abrufen', quit: 'Beenden' },
  'es-ES': { open: 'Abrir Kumo', openUnread: n => `Abrir — ${n} sin leer`, checkMail: 'Revisar correo', quit: 'Salir' },
  'pt-BR': { open: 'Abrir Kumo', openUnread: n => `Abrir — ${n} não lidos`, checkMail: 'Verificar e-mail', quit: 'Sair' },
  'nl-NL': { open: 'Kumo openen', openUnread: n => `Openen — ${n} ongelezen`, checkMail: 'E-mail controleren', quit: 'Afsluiten' },
  'ru-RU': { open: 'Открыть Kumo', openUnread: n => `Открыть — ${n} непрочитанных`, checkMail: 'Проверить почту', quit: 'Выйти' },
  'tr-TR': { open: "Kumo'yu Aç", openUnread: n => `Aç — ${n} okunmamış`, checkMail: 'Postaları Kontrol Et', quit: 'Çıkış' },
  'ko-KR': { open: 'Kumo 열기', openUnread: n => `열기 — ${n}개 읽지 않음`, checkMail: '메일 확인', quit: '종료' },
  'ja-JP': { open: 'Kumoを開く', openUnread: n => `開く — ${n}件の未読`, checkMail: 'メールを確認', quit: '終了' },
  'zh-CN': { open: '打开 Kumo', openUnread: n => `打开 — ${n} 封未读`, checkMail: '检查邮件', quit: '退出' },
}

function updateTrayMenu() {
  if (!tray) return
  const totalUnread = [...unreadCounts.values()].reduce((a, b) => a + b, 0)
  const badge = totalUnread > 0 ? ` (${totalUnread})` : ''
  tray.setToolTip(`Kumo${badge}`)

  const LANG_ALIASES = { en: 'en-US', it: 'it-IT', fr: 'fr-FR', de: 'de-DE', jp: 'ja-JP', es: 'es-ES', ru: 'ru-RU', cn: 'zh-CN' }
  let raw = 'en-US'
  try { raw = getSettings().language || 'en-US' } catch { /* use default */ }
  const lang = LANG_ALIASES[raw] || raw
  const s = TRAY_STRINGS[lang] || TRAY_STRINGS['en-US']

  const contextMenu = Menu.buildFromTemplate([
    {
      label: totalUnread > 0 ? s.openUnread(totalUnread) : s.open,
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: s.checkMail,
      click: () => {
        for (const client of imapClients.values()) client.syncInbox?.()
      }
    },
    { type: 'separator' },
    {
      label: s.quit,
      click: () => confirmAndQuit()
    }
  ])
  tray.setContextMenu(contextMenu)
  updateTaskbarBadge(totalUnread)
}

function updateTaskbarBadge(count) {
  if (!mainWindow) return
  if (count > 0) {
    try {
      const size = 16
      const buf = Buffer.alloc(size * size * 4)
      const r = 4.5
      const cx = 7.5, cy = 7.5
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
          const alpha = Math.max(0, Math.min(1, r + 1 - dist)) * 255
          if (alpha > 0) {
            const idx = (y * size + x) * 4
            buf[idx] = 48; buf[idx + 1] = 59; buf[idx + 2] = 255
            buf[idx + 3] = Math.round(alpha)
          }
        }
      }
      const overlay = nativeImage.createFromBuffer(buf, { width: size, height: size })
      mainWindow.setOverlayIcon(overlay, `${count} unread`)
    } catch { /* overlay icon not supported */ }
  } else {
    try { mainWindow.setOverlayIcon(null, '') } catch { /* ignore */ }
  }
}

function _makeAvatarIcon(from) {
  const size = 64
  const { buffer } = createNotificationAvatarBitmap(from, size)
  return nativeImage.createFromBuffer(buffer, { width: size, height: size })
}

function showNewMailNotification(subject, from, folder, uid) {
  try {
    const settings = getSettings()
    if (!settings.notificationsEnabled) return
    const notifyFolders = settings.notifyFolders || ['INBOX']
    if (!notifyFolders.includes(folder)) return
  } catch { /* proceed anyway if settings unavailable */ }

  if (!Notification.isSupported()) return
  try {
    const icon = _makeAvatarIcon(from)
    const n = new Notification({
      title: from || APP_NAME,
      body: subject || '(No subject)',
      icon,
      silent: false
    })
    n.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
      mainWindow?.webContents.send('imap:notification-click', { folder, uid })
    })
    n.show()
  } catch { /* Notification construction failed */ }
}

function applyRulesToIncomingMessage(email, message) {
  for (const rule of getMailRules(true)) {
    if (!messageMatchesRule(message, rule)) continue
    const action = rule.action || {}
    if (action.type === 'markRead' || action.type === 'star') {
      const flag = action.type === 'markRead' ? '\\Seen' : '\\Flagged'
      const originalFlags = getSnapshotFlags(message)
      const flags = applyFlagChange(originalFlags, flag, true)
      updateMessageOptimistic(message.folder, message.uid, { flags }, { immediate: true })
      enqueueImapOperation('setFlags', 'message',
        { flag, add: true, originalFlags },
        { accountEmail: email, folder: message.folder, uid: message.uid }
      )
    } else if (action.type === 'move' && action.destination) {
      const localChange = moveMessagesOptimistic(
        message.folder,
        [message.uid],
        action.destination
      )
      emitCachedFoldersChanged()
      enqueueImapOperation('moveMessage', 'message',
        { destination: action.destination, ...localChange },
        { accountEmail: email, folder: message.folder, uid: message.uid }
      )
    }
    if (rule.stop_after) break
  }
}

function _attachClientEvents(email, client) {
  if (client._listenersAttached) return
  client._listenersAttached = true
  client.on('message-persisted', (message) => {
    const folder = getFolders().find(item => item.path === message.folder)
    if (folder?.special_use && folder.special_use !== '\\Inbox') return
    applyRulesToIncomingMessage(email, message)
  })
  client.on('new-mail', ({ subject, from, folder, uid }) => {
    const cur = unreadCounts.get(email) || 0
    unreadCounts.set(email, cur + 1)
    updateTrayMenu()
    showNewMailNotification(subject, from, folder, uid)
    mainWindow?.webContents.send('imap:new-mail', { subject, from, folder, uid, account: email })
  })
  client.on('connection-status', (status) => {
    imapCoordinator.setConnectionStatus(status)
    mainWindow?.webContents.send('imap:connection-status', { status, account: email })
  })
  client.on('unread-count', (count) => {
    unreadCounts.set(email, count)
    updateTrayMenu()
  })
  client.on('sync-complete', ({ folder, newCount, removedCount }) => {
    mainWindow?.webContents.send('imap:sync-complete', { folder, newCount, removedCount, account: email })
  })
  client.on('flags-updated', ({ folder, uid, flags }) => {
    mainWindow?.webContents.send('imap:flags-updated', { folder, uid, flags, account: email })
  })
}

function getClient(email) {
  if (email) return imapClients.get(email) || null
  return imapClients.values().next().value || null
}

function getOperationAccountEmail(email) {
  return email || imapClients.keys().next().value || null
}

function getSnapshotFlags(snapshot) {
  return parseStoredFlags(snapshot?.flags)
}

function emitCachedFoldersChanged() {
  mainWindow?.webContents.send('store:folders-changed', getFolders())
}

imapCoordinator.on('operation-update', update => {
  mainWindow?.webContents.send('sync:operation-update', update)
  logImapOperationUpdate(update)
})

function runImapOperation(operation, folder, uid, fn) {
  return imapCoordinator.runDirect({ operation, folder, uid }, fn)
}

function enqueueImapOperation(operation, targetType, data, options) {
  enqueueSyncOperation(operation, targetType, data, options)
  queueMicrotask(() => {
    flushSyncQueue(imapClients, imapCoordinator).catch(err => {
      logErr('Immediate sync queue flush failed', {
        op: operation,
        folder: options?.folder,
        uid: options?.uid,
        error: err.message
      })
    })
  })
}

function logImapOperationUpdate(update) {
  const context = {
    source: update.source,
    op: update.operation,
    id: update.id,
    folder: update.folder,
    uid: update.uid,
    retry: update.retryCount,
    waitMs: update.waitMs,
    durationMs: update.durationMs,
    transient: update.transient
  }
  const readOnly = new Set(['getFolders', 'syncFolders', 'fetchBody', 'search', 'downloadAttachment'])
  const log = readOnly.has(update.operation) ? logDebug : logSync
  if (update.status === 'running') {
    log('IMAP operation started', context)
  } else if (update.status === 'completed') {
    log('IMAP operation completed', context)
  } else if (update.status === 'failed') {
    logErr('IMAP operation failed', { ...context, error: update.error })
  }
}

// ── Auth IPC ──────────────────────────────────────────────────────────────────

ipcMain.handle('auth:save-credentials', async (_e, email, password) => {
  try {
    await saveCredentials(email, password)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('auth:get-credentials', async () => {
  try {
    const creds = await getCredentials()
    return { ok: true, creds }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('auth:delete-credentials', async () => {
  try {
    await deleteCredentials()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ── IMAP IPC ──────────────────────────────────────────────────────────────────

ipcMain.handle('imap:connect', async (_e, email, password) => {
  try {
    if (!email || !password) return { ok: false, error: 'email and password required' }
    const existing = imapClients.get(email)
    if (existing) await existing.disconnect().catch(() => {})
    const client = new ImapClient(email, password)
    _attachClientEvents(email, client)
    imapClients.set(email, client)
    await client.connect()
    return { ok: true }
  } catch (err) {
    imapCoordinator.setConnectionStatus('disconnected')
    imapClients.delete(email)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:disconnect', async (_e, email) => {
  try {
    if (email) {
      const client = imapClients.get(email)
      if (client) {
        await client.disconnect().catch(() => {})
        imapClients.delete(email)
      }
    } else {
      const entries = [...imapClients.entries()]
      for (const [e, c] of entries) {
        await c.disconnect().catch(() => {})
        imapClients.delete(e)
      }
    }
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('imap:get-folders', async (_e, email) => {
  try {
    const folders = getFolders()
    return { ok: true, folders }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:sync-folders', async (_e, email) => {
  const imapClient = getClient(email)
  if (!imapClient) return { ok: false, error: 'Not connected' }
  try {
    await runImapOperation('syncFolders', null, null, () => imapClient._syncFolders())
    return { ok: true, folders: getFolders() }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:fetch-messages', async (_e, folder, page, pageSize, email) => {
  try {
    const currentPage = page || 1
    const currentPageSize = pageSize || 50
    const offset = (currentPage - 1) * currentPageSize
    let total
    let messages
    if (String(folder).startsWith('smart:')) {
      const smartType = String(folder).slice(6)
      const definitions = {
        unread: { unread: true },
        starred: { starred: true },
        attachments: { hasAttachments: true },
        reply: { needsReply: true }
      }
      let definition = definitions[smartType]
      if (!definition && smartType.startsWith('rule-')) {
        definition = getMailRules().find(
          rule => rule.id === Number(smartType.slice(5))
        )?.match
      }
      definition ||= {}
      total = getSmartMessageCount(definition)
      messages = getSmartMessages(definition, currentPageSize, offset)
    } else {
      total = getMessageCount(folder)
      messages = getMessages(folder, currentPageSize, offset)
    }
    return {
      ok: true,
      messages,
      total,
      page: currentPage,
      pageSize: currentPageSize,
      hasMore: offset + messages.length < total
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:fetch-body', async (_e, folder, uid, email) => {
  const imapClient = getClient(email)
  if (!imapClient) return { ok: false, error: 'Not connected' }
  try {
    const body = await runImapOperation('fetchBody', folder, uid, () => imapClient.fetchBody(folder, uid))
    return { ok: true, body }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:mark-read', async (_e, folder, uid, read, email) => {
  try {
    const snapshot = getMessageSnapshots(folder, [uid])[0]
    const originalFlags = getSnapshotFlags(snapshot)
    const flags = applyFlagChange(originalFlags, '\\Seen', read)
    updateMessageOptimistic(folder, uid, { flags }, { immediate: true })
    recalcFolderUnread(folder)
    enqueueImapOperation('setFlags', 'message',
      { flag: '\\Seen', add: read, originalFlags },
      { accountEmail: getOperationAccountEmail(email), folder, uid }
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:star-message', async (_e, folder, uid, starred, email) => {
  try {
    const snapshot = getMessageSnapshots(folder, [uid])[0]
    const originalFlags = getSnapshotFlags(snapshot)
    const flags = applyFlagChange(originalFlags, '\\Flagged', starred)
    updateMessageOptimistic(folder, uid, { flags }, { immediate: true })
    enqueueImapOperation('setFlags', 'message',
      { flag: '\\Flagged', add: starred, originalFlags },
      { accountEmail: getOperationAccountEmail(email), folder, uid }
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:move-message', async (_e, folder, uid, destination, email) => {
  try {
    const { originalMessages, originalAttachments, optimisticMessages } = moveMessagesOptimistic(
      folder,
      [uid],
      destination
    )
    emitCachedFoldersChanged()
    enqueueImapOperation('moveMessage', 'message',
      { destination, originalMessages, originalAttachments, optimisticMessages },
      { accountEmail: getOperationAccountEmail(email), folder, uid }
    )
    return { ok: true, destination }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:archive-message', async (_e, folder, uid, email) => {
  try {
    const archiveFolder = getFolders().find(item => item.special_use === '\\Archive')?.path || 'Archive'
    const { originalMessages, originalAttachments, optimisticMessages } = moveMessagesOptimistic(
      folder,
      [uid],
      archiveFolder
    )
    emitCachedFoldersChanged()
    enqueueImapOperation('moveMessage', 'message',
      { destination: archiveFolder, originalMessages, originalAttachments, optimisticMessages },
      { accountEmail: getOperationAccountEmail(email), folder, uid }
    )
    return { ok: true, destination: archiveFolder }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:delete-message', async (_e, folder, uid, permanent, email) => {
  try {
    const trashFolder = getFolders().find(item => item.special_use === '\\Trash')?.path || 'Deleted Messages'
    const shouldMove = !permanent && folder !== trashFolder
    const localChange = shouldMove
      ? moveMessagesOptimistic(folder, [uid], trashFolder)
      : {
          originalMessages: getMessageSnapshots(folder, [uid]),
          originalAttachments: getAttachmentSnapshots(folder, [uid]),
          optimisticMessages: []
        }
    if (!shouldMove) {
      removeMessages([uid], folder)
      persistDBImmediate()
    }
    emitCachedFoldersChanged()
    enqueueImapOperation('deleteMessage', 'message',
      {
        permanent,
        destination: shouldMove ? trashFolder : null,
        originalMessages: localChange.originalMessages,
        originalAttachments: localChange.originalAttachments,
        optimisticMessages: localChange.optimisticMessages
      },
      { accountEmail: getOperationAccountEmail(email), folder, uid }
    )
    return { ok: true, destination: shouldMove ? trashFolder : null }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:mark-junk', async (_e, folder, uid, isJunk, email) => {
  try {
    const destination = isJunk
      ? getFolders().find(item => item.special_use === '\\Junk')?.path || 'Junk'
      : 'INBOX'
    const { originalMessages, originalAttachments, optimisticMessages } = moveMessagesOptimistic(
      folder,
      [uid],
      destination
    )
    emitCachedFoldersChanged()
    enqueueImapOperation('markJunk', 'message',
      { isJunk, destination, originalMessages, originalAttachments, optimisticMessages },
      { accountEmail: getOperationAccountEmail(email), folder, uid }
    )
    return { ok: true, destination }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:search', async (_e, folder, query, email) => {
  const imapClient = getClient(email)
  if (!imapClient) return { ok: false, error: 'Not connected' }
  try {
    const results = await runImapOperation('search', folder, null, () => imapClient.search(folder, query))
    return { ok: true, results }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:sync-inbox', async (_e, email) => {
  const imapClient = getClient(email)
  if (!imapClient) return { ok: false, error: 'Not connected' }
  try {
    await runImapOperation('syncInbox', 'INBOX', null, () => imapClient.syncInbox())
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:sync-folder', async (_e, folder, email) => {
  const imapClient = getClient(email)
  if (!imapClient) return { ok: false, error: 'Not connected' }
  try {
    await runImapOperation('syncFolder', folder, null, () => imapClient._syncFolder(folder, false))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:mark-all-read', async (_e, folder, email) => {
  const imapClient = getClient(email)
  if (!imapClient) return { ok: false, error: 'Not connected' }
  try {
    await runImapOperation('markAllRead', folder, null, () => imapClient.markAllRead(folder))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:empty-folder', async (_e, folder, email) => {
  const imapClient = getClient(email)
  if (!imapClient) return { ok: false, error: 'Not connected' }
  try {
    await runImapOperation('emptyFolder', folder, null, () => imapClient.emptyFolder(folder))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:bulk-set-flag', async (_e, folder, uids, flag, add, email) => {
  try {
    const snapshots = getMessageSnapshots(folder, uids)
    const originalFlags = snapshots.map(snapshot => ({
      uid: snapshot.uid,
      flags: getSnapshotFlags(snapshot)
    }))
    for (const original of originalFlags) {
      updateMessageOptimistic(
        folder,
        original.uid,
        { flags: applyFlagChange(original.flags, flag, add) }
      )
    }
    if (flag === '\\Seen') recalcFolderUnread(folder)
    persistDBImmediate()
    enqueueImapOperation('bulkSetFlags', 'message',
      { uids, flag, add, originalFlags },
      { accountEmail: getOperationAccountEmail(email), folder }
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:bulk-delete', async (_e, folder, uids, email) => {
  try {
    const trashFolder = getFolders().find(item => item.special_use === '\\Trash')?.path || 'Deleted Messages'
    const shouldMove = folder !== trashFolder
    const localChange = shouldMove
      ? moveMessagesOptimistic(folder, uids, trashFolder)
      : {
          originalMessages: getMessageSnapshots(folder, uids),
          originalAttachments: getAttachmentSnapshots(folder, uids),
          optimisticMessages: []
        }
    if (!shouldMove) {
      removeMessages(uids, folder)
      persistDBImmediate()
    }
    emitCachedFoldersChanged()
    enqueueImapOperation('bulkDelete', 'message',
      {
        uids,
        destination: shouldMove ? trashFolder : null,
        originalMessages: localChange.originalMessages,
        originalAttachments: localChange.originalAttachments,
        optimisticMessages: localChange.optimisticMessages
      },
      { accountEmail: getOperationAccountEmail(email), folder }
    )
    return { ok: true, destination: shouldMove ? trashFolder : null }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:bulk-move', async (_e, folder, uids, destination, email) => {
  try {
    const { originalMessages, originalAttachments, optimisticMessages } = moveMessagesOptimistic(
      folder,
      uids,
      destination
    )
    emitCachedFoldersChanged()
    enqueueImapOperation('bulkMove', 'message',
      { uids, destination, originalMessages, originalAttachments, optimisticMessages },
      { accountEmail: getOperationAccountEmail(email), folder }
    )
    return { ok: true, destination }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ── SMTP IPC ──────────────────────────────────────────────────────────────────

ipcMain.handle('smtp:send', async (_e, email, password, mailOptions) => {
  try {
    await sendEmail(email, password, mailOptions)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('smtp:send-optimistic', async (_e, outboxEmail) => {
  let id = null
  try {
    const undoSeconds = Math.max(0, Number(getSettings().undoSendDelay || 0))
    const sendAfter = Date.now() + undoSeconds * 1000
    id = addToOutbox({ ...outboxEmail, sendAfter })

    enqueueSyncOperation('sendEmail', 'email',
      {
        outboxId: id,
        mailOptions: outboxEmail
      },
      {
        accountEmail: outboxEmail.accountEmail,
        targetId: id,
        availableAt: sendAfter
      }
    )

    if (undoSeconds > 0) {
      mainWindow?.webContents.send('smtp:undo-window', {
        outboxId: id,
        sendAfter,
        undoSeconds,
        subject: outboxEmail.subject || ''
      })
    }
    setTimeout(() => {
      flushSyncQueue(imapClients, imapCoordinator).catch(() => {})
    }, Math.max(0, sendAfter - Date.now()) + 50)
    return { ok: true, outboxId: id, sendAfter, undoSeconds }
  } catch (err) {
    if (id) markOutboxEmailFailed(id, err.message)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('smtp:cancel-send', async (_e, outboxId) => {
  try {
    return { ok: cancelOutboxEmail(outboxId) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ── Store IPC ─────────────────────────────────────────────────────────────────

ipcMain.handle('store:search-local', async (_e, query) => {
  try {
    const results = searchMessages(query)
    return { ok: true, results }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:get-thread', async (_e, threadId, messageId) => {
  try {
    return { ok: true, messages: getThreadMessages(threadId, messageId) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:get-cached-folders', async () => {
  try {
    const folders = getFolders()
    return { ok: true, folders }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:get-sync-state', async (_e, folder) => {
  try {
    const creds = await getCredentials()
    if (!creds) return { ok: true, state: null }
    const state = getSyncState(creds.email, folder)
    return { ok: true, state }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

async function getLocalStorageUsage() {
  const userData = app.getPath('userData')
  const [database, attachments, logs] = await Promise.all([
    getFileSize(getDbPath()),
    getDirectorySize(join(userData, 'attachments')),
    getDirectorySize(join(userData, 'logs'))
  ])
  return {
    total: database + attachments + logs,
    database,
    attachments,
    logs,
    counts: getStorageCounts()
  }
}

ipcMain.handle('store:get-storage-usage', async () => {
  try {
    return { ok: true, usage: await getLocalStorageUsage() }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:free-space', async () => {
  try {
    const before = await getLocalStorageUsage()
    await clearDirectoryContents(join(app.getPath('userData'), 'attachments'))
    clearReclaimableCache()
    const after = await getLocalStorageUsage()
    logInfo('Local cache cleared', {
      freedBytes: Math.max(0, before.total - after.total),
      cachedBodies: before.counts.cachedBodies,
      attachments: before.counts.downloadedAttachments,
      senderLogos: before.counts.senderLogos
    })
    return {
      ok: true,
      freedBytes: Math.max(0, before.total - after.total),
      usage: after
    }
  } catch (err) {
    logErr('Local cache cleanup failed', { error: err.message })
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:rebuild-mail-cache', async () => {
  try {
    if (getSyncQueueCount() > 0) {
      return { ok: false, code: 'pending-sync-operations', error: 'Pending sync operations' }
    }
    const before = await getLocalStorageUsage()
    await clearDirectoryContents(join(app.getPath('userData'), 'attachments'))
    rebuildMailCache()
    mainWindow?.webContents.send('store:folders-changed', [])
    const after = await getLocalStorageUsage()
    logInfo('Mail cache rebuilt', {
      freedBytes: Math.max(0, before.total - after.total),
      messages: before.counts.messages
    })
    return {
      ok: true,
      freedBytes: Math.max(0, before.total - after.total),
      usage: after
    }
  } catch (err) {
    logErr('Mail cache rebuild failed', { error: err.message })
    return {
      ok: false,
      code: err.message === 'pending-sync-operations' ? err.message : undefined,
      error: err.message
    }
  }
})

ipcMain.handle('store:clear-logs', async () => {
  try {
    const bytesFreed = await clearDirectoryContents(join(app.getPath('userData'), 'logs'))
    initLogger(join(app.getPath('userData'), 'logs', 'kumo.log'))
    return { ok: true, bytesFreed, usage: await getLocalStorageUsage() }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:export-diagnostics', async () => {
  try {
    const result = await dialog.showSaveDialog({
      defaultPath: `Kumo-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`,
      buttonLabel: 'Export',
      filters: [{ name: 'Text report', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    const { readdir, readFile, writeFile } = await import('fs/promises')
    const logsDir = join(app.getPath('userData'), 'logs')
    const names = await readdir(logsDir).catch(() => [])
    const logs = []
    for (const name of names.filter(name => name.startsWith('kumo.log')).sort()) {
      logs.push({ name, content: await readFile(join(logsDir, name), 'utf8').catch(() => '') })
    }
    const report = buildDiagnosticReportText({
      appVersion: app.getVersion(),
      platform: `${process.platform} ${process.arch}`,
      locale: app.getLocale(),
      logs
    })
    await writeFile(result.filePath, report, 'utf8')
    logInfo('Diagnostic report exported', { file: result.filePath, logFiles: logs.length })
    return { ok: true, filePath: result.filePath }
  } catch (err) {
    logErr('Diagnostic report export failed', { error: err.message })
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:clear-body-cache', async () => {
  try {
    clearBodyCache()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:clear-folder-cache', async () => {
  try {
    clearFolderCache()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:clear-messages', async () => {
  try {
    clearMessages()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:get-db-path', async () => {
  return { ok: true, path: getDbPath() }
})

ipcMain.handle('store:open-db-folder', async () => {
  try {
    const p = getDbPath()
    if (p) {
      await shell.openPath(dirname(p))
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:reset-all-data', async () => {
  try {
    const entries = [...imapClients.entries()]
    for (const [e, c] of entries) {
      await c.disconnect().catch(() => {})
      imapClients.delete(e)
    }
    unreadCounts.clear()
    await deleteCredentials().catch(() => {})
    resetAllData()
    await clearDirectoryContents(join(app.getPath('userData'), 'attachments'))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('store:get-viewer-data', async (_e, id) => {
  const data = viewerDataStore.get(id)
  if (data) viewerDataStore.delete(id)
  return { ok: true, data: data || null }
})

ipcMain.handle('store:read-local-file', async (_e, filePath) => {
  try {
    const attDir = join(app.getPath('userData'), 'attachments')
    const resolved = resolve(String(filePath))
    if (!resolved.startsWith(attDir + sep) && resolved !== attDir) {
      return { ok: false, error: 'Forbidden' }
    }
    const { readFileSync } = await import('fs')
    const buf = readFileSync(resolved)
    return { ok: true, base64: buf.toString('base64') }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ── Settings IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('store:get-pending-ops-count', () => {
  try { return { ok: true, count: getSyncQueueCount() } }
  catch { return { ok: true, count: 0 } }
})

ipcMain.handle('settings:get', async () => {
  try {
    const settings = getSettings()
    return { ok: true, settings }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('settings:save', async (_e, updates) => {
  try {
    for (const [key, value] of Object.entries(updates)) saveSetting(key, value)
    updateTrayMenu()
    if ('theme' in updates && mainWindow && !mainWindow.isDestroyed()) {
      const isDark = updates.theme === 'dark'
      mainWindow.setTitleBarOverlay({
        color: isDark ? '#0e1014' : '#eceef3',
        symbolColor: isDark ? '#6f7686' : '#8a909d',
        height: 32
      })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('sender-logo:get', async (_e, sender, folder = null) => {
  try {
    if (getSettings().showSenderLogos !== true) {
      return { ok: true, dataUrl: null, source: null, disabled: true }
    }
    if (isLogoExcludedFolder(folder)) {
      return { ok: true, dataUrl: null, source: null, excluded: true }
    }
    if (!senderLogoResolver) return { ok: true, dataUrl: null, source: null }

    const result = await senderLogoResolver.get(sender)
    return {
      ok: true,
      dataUrl: result.dataUrl,
      source: result.source,
      cached: result.cached === true
    }
  } catch (err) {
    logDebug('Sender logo lookup failed', { error: err.message })
    return { ok: true, dataUrl: null, source: null }
  }
})

// ── Drafts IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('drafts:list', async (_e, accountEmail) => {
  try { return { ok: true, drafts: getDrafts(accountEmail) } }
  catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('drafts:save', async (_e, draft) => {
  try {
    const id = upsertDraft(draft)
    enqueueSyncOperation('saveDraft', 'draft', { draftId: id }, {
      accountEmail: draft.account_email || getOperationAccountEmail(),
      targetId: id,
      coalesce: true
    })
    queueMicrotask(() => flushSyncQueue(imapClients, imapCoordinator).catch(() => {}))
    return { ok: true, id }
  } catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('drafts:delete', async (_e, id) => {
  try {
    const draft = getDraft(id)
    deleteDraft(id)
    if (draft?.remote_uid && draft?.remote_folder) {
      enqueueSyncOperation('deleteDraft', 'draft', {
        remoteUid: draft.remote_uid,
        remoteFolder: draft.remote_folder
      }, {
        accountEmail: draft.account_email || getOperationAccountEmail(),
        targetId: id,
        coalesce: true
      })
      queueMicrotask(() => flushSyncQueue(imapClients, imapCoordinator).catch(() => {}))
    }
    return { ok: true }
  }
  catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('drafts:open-remote', async (_e, folder, uid, email) => {
  try {
    let draft = findDraftByRemote(folder, uid)
    if (!draft) {
      const client = getClient(email)
      await client?.syncDrafts()
      draft = findDraftByRemote(folder, uid)
    }
    return draft ? { ok: true, draft } : { ok: false, error: 'Draft not found' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('rules:list', async () => {
  try { return { ok: true, rules: getMailRules() } }
  catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('rules:save', async (_e, rule) => {
  try { return { ok: true, id: saveMailRule(rule) } }
  catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('rules:delete', async (_e, id) => {
  try { deleteMailRule(id); return { ok: true } }
  catch (err) { return { ok: false, error: err.message } }
})

// ── Contacts IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('contacts:sync', async (_e, email, password) => {
  try {
    const localContacts = getContacts(email)
    const { contacts, failedHrefs } = await syncContacts(email, password)
    logContact('[contacts:sync] Contacts fetched, starting upsert', { count: contacts.length })
    let saved = 0, failed = 0
    for (const c of contacts) {
      try {
        upsertContact({ ...c, account_email: email })
        saved++
      } catch (err) {
        failed++
        if (failed <= 3) logErr('[contacts:sync] Contact upsert failed', {
          name: c.display_name,
          uid: c.id,
          error: err.message
        })
      }
    }
    const deletedIds = getContactsToDelete(localContacts, contacts, failedHrefs)
    deleteContactsByIds(email, deletedIds)
    logContact('[contacts:sync] Completed', { saved, failed, deleted: deletedIds.length })
    return { ok: true, count: saved }
  } catch (err) {
    logErr('[contacts:sync] Failed', { error: err.message })
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('contacts:list', async (_e, email) => {
  try {
    const contacts = getContacts(email)
    logContact('[contacts:list] Contacts returned', { account: email, count: contacts.length })
    return { ok: true, contacts }
  } catch (err) {
    logErr('[contacts:list] Failed', { error: err.message })
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('contacts:search', async (_e, query, email) => {
  try {
    const contacts = searchContacts(query, email)
    return { ok: true, contacts }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('contacts:save', async (_e, contact, email) => {
  try {
    const accountEmail = email || contact.account_email || getOperationAccountEmail()
    const creds = await getCredentials(accountEmail)
    if (!creds) throw new Error(`No credentials for ${accountEmail}`)
    const saved = await saveContact(creds.email, creds.password, contact)
    const local = { ...saved, account_email: creds.email, source: 'carddav' }
    upsertContact(local)
    return { ok: true, contact: local }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('contacts:delete', async (_e, contact, email) => {
  try {
    const accountEmail = email || contact.account_email || getOperationAccountEmail()
    const creds = await getCredentials(accountEmail)
    if (!creds) throw new Error(`No credentials for ${accountEmail}`)
    await deleteContactRemote(creds.email, creds.password, contact)
    deleteContact(contact.id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('contacts:clear', async (_e, email) => {
  try {
    deleteContacts(email)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('contacts:dump-raw', async (_e, email, password) => {
  logContact('[dump-raw] Started', { account: email })
  try {
    logContact('[dump-raw] Fetching raw contacts')
    const raw = await dumpRawContacts(email, password)
    logContact('[dump-raw] Raw contacts received, opening save dialog', { characters: raw.length })
    const result = await dialog.showSaveDialog({
      defaultPath: `carddav-raw-${Date.now()}.txt`,
      filters: [{ name: 'Text files', extensions: ['txt'] }],
      buttonLabel: 'Salva dump'
    })
    if (result.canceled || !result.filePath) {
      logContact('[dump-raw] Save dialog canceled')
      return { ok: false }
    }
    const { writeFileSync } = await import('fs')
    writeFileSync(result.filePath, raw, 'utf8')
    logContact('[dump-raw] Saved', { file: result.filePath })
    return { ok: true, filePath: result.filePath }
  } catch (err) {
    logErr('[dump-raw] Failed', { error: err.message })
    return { ok: false, error: err.message }
  }
})


// ── Calendar IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('calendar:sync', async (_e, email, password) => {
  try {
    const previousSources = getCalendarSources(email)
    const disabledHrefs = previousSources.filter(source => !source.enabled).map(source => source.href)
    const { items, sources, succeededHrefs, failedHrefs } = await syncCalendar(
      email,
      password,
      { disabledHrefs }
    )

    // Upsert all discovered sources (ON CONFLICT preserves user's enabled state)
    for (const src of sources) {
      upsertCalendarSource({ ...src, account_email: email })
    }
    const currentHrefs = sources.map(source => source.href)
    const removedHrefs = previousSources
      .filter(source => !currentHrefs.includes(source.href))
      .map(source => source.href)
    deleteCalendarSourcesNotIn(email, currentHrefs)

    // Replace only complete calendars. Failed calendars keep their last good cache.
    const replaceHrefs = getCalendarsToReplace({
      succeededHrefs,
      failedHrefs,
      disabledHrefs: [...disabledHrefs, ...removedHrefs]
    })
    deleteEventsByCalendarHrefs(email, replaceHrefs)
    let saved = 0
    for (const item of items) {
      upsertEvent({ ...item, account_email: email })
      saved++
    }
    return { ok: true, count: saved }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('calendar:events', async (_e, email, fromTs, toTs) => {
  try {
    const events = getEvents(email, fromTs, toTs)
    return { ok: true, events }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('calendar:save', async (_e, item, email) => {
  try {
    const accountEmail = email || item.account_email || getOperationAccountEmail()
    const creds = await getCredentials(accountEmail)
    if (!creds) throw new Error(`No credentials for ${accountEmail}`)
    const saved = await saveCalendarItem(creds.email, creds.password, item)
    const source = getCalendarSources(accountEmail).find(entry => entry.href === saved.calendar_href)
    const local = {
      ...saved,
      account_email: accountEmail,
      calendar_id: item.calendar_id || source?.name || 'Calendar'
    }
    upsertEvent(local)
    return { ok: true, event: local }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('calendar:delete', async (_e, item, email) => {
  try {
    const accountEmail = email || item.account_email || getOperationAccountEmail()
    const creds = await getCredentials(accountEmail)
    if (!creds) throw new Error(`No credentials for ${accountEmail}`)
    await deleteCalendarItemRemote(creds.email, creds.password, item)
    deleteEvent(item.id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('calendar:respond', async (_e, invite, response, email) => {
  try {
    const accountEmail = email || getOperationAccountEmail()
    const creds = await getCredentials(accountEmail)
    if (!creds) throw new Error(`No credentials for ${accountEmail}`)
    await sendCalendarReply(creds.email, creds.password, invite, response, creds.email)
    const attendee = {
      email: creds.email,
      name: creds.email,
      partstat: response === 'accepted' ? 'ACCEPTED' : response === 'declined' ? 'DECLINED' : 'TENTATIVE'
    }
    const updated = {
      ...invite,
      account_email: creds.email,
      attendees: [...(invite.attendees || []).filter(value =>
        (typeof value === 'string' ? value : value.email)?.toLowerCase() !== creds.email.toLowerCase()
      ), attendee]
    }
    if (invite.href) {
      upsertEvent(updated)
      return { ok: true, event: updated }
    }
    if (response === 'declined') return { ok: true, event: updated }
    const saved = await saveCalendarItem(creds.email, creds.password, updated)
    upsertEvent({ ...saved, account_email: creds.email })
    return { ok: true, event: saved }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('calendar:clear', async (_e, email) => {
  try {
    deleteEvents(email)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('calendar:sources', async (_e, email) => {
  try {
    const sources = getCalendarSources(email)
    return { ok: true, sources }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('calendar:toggle-source', async (_e, href, enabled) => {
  try {
    setCalendarSourceEnabled(href, enabled)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ── Window controls ───────────────────────────────────────────────────────────

ipcMain.handle('window:set-title', (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setTitle(String(title))
})
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.hide())
ipcMain.handle('window:set-badge', (_e, count) => {
  const n = Math.max(0, count)
  updateTaskbarBadge(n)
})

ipcMain.handle('window:open-message', async (_e, msg) => {
  try {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    const folder = getFolders().find(item => item.path === msg.folder)
    viewerDataStore.set(id, {
      ...msg,
      folder_special_use: folder?.special_use || msg.folder_special_use || null
    })

    const { backgroundColor: vBg, titleBarOverlay: vOverlay } = getSubWindowTheme()
    const viewerWindow = new BrowserWindow({
      width: 820,
      height: 720,
      minWidth: 580,
      minHeight: 480,
      frame: false,
      icon: getResourcePath('icon.ico'),
      backgroundColor: vBg,
      titleBarStyle: 'hidden',
      titleBarOverlay: vOverlay,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      },
      show: false
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      viewerWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?viewer=1&vid=${id}`)
    } else {
      viewerWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        query: { viewer: '1', vid: id }
      })
    }

    _attachExternalLinkHandler(viewerWindow)
    viewerWindow.once('ready-to-show', () => viewerWindow.show())
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('window:open-compose-in-main', (_e, data) => {
  mainWindow?.webContents.send('open-compose', data)
  mainWindow?.show()
  mainWindow?.focus()
  return { ok: true }
})

ipcMain.handle('window:open-compose', async (_e, data) => {
  try {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    viewerDataStore.set(id, data)

    const { backgroundColor: cBg, titleBarOverlay: cOverlay } = getSubWindowTheme()
    const composeWindow = new BrowserWindow({
      width: 740,
      height: 640,
      minWidth: 520,
      minHeight: 480,
      frame: false,
      icon: getResourcePath('icon.ico'),
      backgroundColor: cBg,
      titleBarStyle: 'hidden',
      titleBarOverlay: cOverlay,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      },
      show: false
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      composeWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?compose=1&cid=${id}`)
    } else {
      composeWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        query: { compose: '1', cid: id }
      })
    }

    _attachExternalLinkHandler(composeWindow)
    composeWindow.once('ready-to-show', () => composeWindow.show())
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('shell:open-external', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url)
})

ipcMain.handle('shell:open-path', (_e, filePath) => {
  return shell.openPath(filePath)
})

// ── Dialog ────────────────────────────────────────────────────────────────────

ipcMain.handle('dialog:save-file', async (_e, sourcePath, filename) => {
  const result = await dialog.showSaveDialog({
    defaultPath: filename,
    buttonLabel: 'Salva'
  })
  if (result.canceled || !result.filePath) return { ok: false }
  try {
    const { copyFileSync } = await import('fs')
    copyFileSync(sourcePath, result.filePath)
    return { ok: true, filePath: result.filePath }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('dialog:pick-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Attach Files'
  })
  if (result.canceled) return { ok: true, files: [] }
  const { statSync } = await import('fs')
  const { basename } = await import('path')
  const files = result.filePaths.map(p => {
    let size = 0
    try { size = statSync(p).size } catch { /* ignore */ }
    return { path: p, name: basename(p), size }
  })
  return { ok: true, files }
})

ipcMain.handle('imap:download-attachment', async (_e, folder, uid, partId, filename, email) => {
  try {
    const client = getClient(email)
    if (!client) return { ok: false, error: 'Not connected' }

    const { mkdirSync, existsSync } = await import('fs')
    const attDir = join(app.getPath('userData'), 'attachments')
    mkdirSync(attDir, { recursive: true })
    const safePartId = String(partId).replace(/[^0-9.]/g, '_')
    const safeName = filename.replace(/[^a-z0-9._-]/gi, '_')
    const dest = join(attDir, `${uid}_${safePartId}_${safeName}`)
    if (!resolve(dest).startsWith(attDir + sep)) return { ok: false, error: 'Forbidden' }

    // Return cached file immediately without hitting IMAP
    if (existsSync(dest)) return { ok: true, filePath: dest }

    const { downloaded, filePath } = await runImapOperation(
      'downloadAttachment',
      folder,
      uid,
      () => client.downloadAttachment(folder, uid, partId, dest)
    )
    if (downloaded) {
      const metas = getAttachmentsMeta(uid, folder)
      const meta = metas.find(m => m.part_id === partId && m.filename === filename)
      if (meta) markAttachmentDownloaded(meta.id, filePath)
    }
    return { ok: true, filePath }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('imap:get-attachment-meta', async (_e, uid, folder) => {
  try {
    const metas = getAttachmentsMeta(uid, folder)
    return { ok: true, metas }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

async function confirmAndQuit() {
  const pending = getSyncQueueCount()
  if (pending > 0) {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Sincronizza e chiudi', 'Chiudi comunque', 'Annulla'],
      defaultId: 0,
      cancelId: 2,
      title: 'Azioni in sospeso',
      message: `Ci sono ${pending} ${pending === 1 ? 'azione non sincronizzata' : 'azioni non sincronizzate'}.`,
      detail: 'Vuoi sincronizzarle prima di chiudere?'
    })
    if (response === 0) {
      await flushSyncQueue(imapClients, imapCoordinator).catch(() => {})
      requestAppExit()
      app.quit()
    } else if (response === 1) {
      requestAppExit()
      app.quit()
    }
  } else {
    requestAppExit()
    app.quit()
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

const KUMO_MIME = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp'
}

app.whenReady().then(async () => {
  if (process.env.ELECTRON_RENDERER_URL) printKumoTerminalBanner()

  protocol.handle('kumo-local', async (request) => {
    try {
      let filePath = decodeURIComponent(new URL(request.url).pathname)
      if (filePath.startsWith('/')) filePath = filePath.slice(1)
      filePath = filePath.replace(/\//g, sep)
      const attDir = join(app.getPath('userData'), 'attachments')
      const resolved = resolve(filePath)
      if (!resolved.startsWith(attDir + sep) && resolved !== attDir) {
        return new Response(null, { status: 403 })
      }
      const { readFile } = await import('fs/promises')
      const data = await readFile(resolved)
      const ext = (resolved.split('.').pop() || '').toLowerCase()
      const mimeType = KUMO_MIME[ext] || 'application/octet-stream'
      return new Response(data, { headers: { 'content-type': mimeType } })
    } catch {
      return new Response(null, { status: 404 })
    }
  })

  initLogger(join(app.getPath('userData'), 'logs', 'kumo.log'))
  await initDB()
  senderLogoResolver = createSenderLogoResolver({
    cache: {
      get: getSenderLogoCache,
      set: setSenderLogoCache
    },
    log: (event, context) => logDebug(`Sender logo ${event}`, context)
  })
  createWindow()
  createTray()
  initUpdater(mainWindow, { requestExit: requestAppExit })

  let storedEmails = []
  try {
    storedEmails = await listStoredEmails()
  } catch (err) {
    logErr('Could not load stored account', { error: err.message })
  }
  for (const email of storedEmails) {
    const creds = await getCredentials(email)
    if (!creds) continue
    const client = new ImapClient(creds.email, creds.password)
    _attachClientEvents(creds.email, client)
    imapClients.set(creds.email, client)
    client.connect().catch(err => {
      imapCoordinator.setConnectionStatus('disconnected')
      logErr('IMAP auto-connect failed', {
        account: creds.email,
        error: err.message
      })
      imapClients.delete(creds.email)
    })
  }

  // Replay pending sync operations, then start the background runner
  setTimeout(() => {
    replayPendingSyncOperations(imapClients, imapCoordinator).catch(err => {
      logErr('Startup sync failed', { error: err.message })
    }).finally(() => {
      startSyncRunner(imapClients, imapCoordinator)
    })
  }, 2000) // Wait 2 seconds for IMAP connections to establish
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  appExit.requestExit()
  stopSyncRunner()
  for (const client of imapClients.values()) {
    await client.disconnect().catch(() => {})
  }
  closeDB()
})
