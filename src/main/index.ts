import { app, BrowserWindow } from 'electron'
import { chatService } from './chat/chat-service'
import { createMainWindow } from './app/create-window'
import { registerSettingsIpc } from './ipc/settings-ipc'
import { registerHighlightSoundIpc } from './ipc/highlight-sound-ipc'
import { registerModerationIpc } from './ipc/moderation-ipc'
import { registerChatIpc } from './ipc/chat-ipc'
import { registerChannelActivityIpc } from './ipc/channel-activity-ipc'
import { registerWindowIpc } from './ipc/window-ipc'
import { registerChatSearchIpc } from './ipc/chat-search-ipc'
import { ChatSearchWindowController } from './chat-search/chat-search-window'
import { createChatSearchPopup } from './chat-search/create-chat-search-popup'
import { registerSettingsWindowIpc } from './ipc/settings-window-ipc'
import { SettingsWindowController } from './settings-window/settings-window-controller'
import { createSettingsPopup } from './settings-window/create-settings-popup'
import {
  isAuthenticated,
  registerAuthIpc,
  restoreAuthSession,
  setAuthWindow
} from './auth/auth-controller'
import { registerChatEvents } from './app/register-events'
import { loadSettings } from './settings-store'
import { changeMainLocale } from './i18n/i18n-main'
import { ChannelActivityWindowController } from './channel-activity/channel-activity-window'
import { createChannelActivityPopup } from './channel-activity/create-channel-activity-popup'
import { registerModerationLogsIpc } from './ipc/moderation-logs-ipc'
import { ModerationLogWindowController } from './moderation-logs/moderation-log-window'
import { createModerationLogsPopup } from './moderation-logs/create-moderation-logs-popup'
import { moderationLogRecorder } from './moderation-logs/moderation-log-recorder'
import { startMemoryDiagnostics } from './diagnostics/memory-diagnostics'
import { BRAND } from '../shared/brand'

const stopMemoryDiagnostics = startMemoryDiagnostics({
  enabled: process.env[BRAND.memoryDiagnosticsEnv] === '1',
  memoryUsage: process.memoryUsage,
  appMetrics: () => app.getAppMetrics(),
  log: console.log
})
app.on('before-quit', stopMemoryDiagnostics)
let mainWindow: BrowserWindow | null = null
const channelActivityWindow = new ChannelActivityWindowController(
  () => createChannelActivityPopup(mainWindow),
  {
    open: (target) => chatService.channelActivity.open(target),
    loadMore: (requestId) => chatService.channelActivity.loadMore(requestId),
    close: (requestId) => chatService.channelActivity.close(requestId),
    moderation: (target) => chatService.channelActivity.moderation(target),
    runModeration: (target, iconType) => chatService.channelActivity.runModeration(target, iconType)
  }
)
const chatSearchWindow = new ChatSearchWindowController(() =>
  createChatSearchPopup(mainWindow)
)
const settingsWindow = new SettingsWindowController(() =>
  createSettingsPopup(mainWindow)
)
const moderationLogsWindow = new ModerationLogWindowController(
  () => createModerationLogsPopup(mainWindow),
  moderationLogRecorder
)
function createWindow(): void {
  mainWindow = createMainWindow({
    onClosed: () => {
      mainWindow = null
      channelActivityWindow.close()
      chatSearchWindow.close()
      settingsWindow.close()
      moderationLogsWindow.close()
      setAuthWindow(null)
      chatService.stopChat()
    }
  })
  setAuthWindow(mainWindow)
}

function registerIpc(): void {
  registerAuthIpc()
  registerChatIpc(chatService, isAuthenticated)
  registerModerationIpc(chatService)
  registerChannelActivityIpc(chatService, channelActivityWindow)
  registerChatSearchIpc(chatSearchWindow)
  registerSettingsIpc()
  registerHighlightSoundIpc()
  registerSettingsWindowIpc(settingsWindow)
  registerModerationLogsIpc(moderationLogsWindow, () => mainWindow)
  registerWindowIpc(() => mainWindow)
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId(BRAND.appId)
  // Silencia parser do youtubei (ShowActionDialog, etc.) — não afeta nossa moderação raw
  try {
    const yti = await import('youtubei.js')
    const setHandler = (yti as { Parser?: { setParserErrorHandler?: (h: unknown) => void } })
      .Parser?.setParserErrorHandler
    if (typeof setHandler === 'function') {
      setHandler(() => {
        /* noop — classes JIT ainda são geradas, sem spam no console */
      })
    }
  } catch {
    /* ignore */
  }
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)
  const quietYoutubeJs = (args: unknown[]): boolean => {
    const first = String(args[0] ?? '')
    return first.includes('[YOUTUBEJS]') || first.includes('InnertubeError') || first.includes('ParsingError')
  }
  console.warn = (...args: unknown[]) => {
    if (quietYoutubeJs(args)) return
    origWarn(...args)
  }
  console.error = (...args: unknown[]) => {
    if (quietYoutubeJs(args)) return
    origError(...args)
  }

  await changeMainLocale(loadSettings().locale)
  registerIpc()

  registerChatEvents(chatService, () => mainWindow)
  // Janela primeiro — não bloquear na rede do YouTube
  createWindow()
  void restoreAuthSession()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  chatService.stopChat()
  if (process.platform !== 'darwin') app.quit()
})
