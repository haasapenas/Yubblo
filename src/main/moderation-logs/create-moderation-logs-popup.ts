import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'path'
import { restoreAndTrackWindowBounds } from '../window-bounds'

export interface ModerationLogsPopup {
  focus(): void
  close(): void
  isDestroyed(): boolean
  onClosed(callback: () => void): void
  send(channel: string, payload: unknown): void
}

const BOUNDS = {
  width: 960,
  height: 640,
  minWidth: 720,
  minHeight: 480
}

export function createModerationLogsPopup(
  parent: BrowserWindow | null
): ModerationLogsPopup {
  const options: BrowserWindowConstructorOptions = {
    width: BOUNDS.width,
    height: BOUNDS.height,
    minWidth: BOUNDS.minWidth,
    minHeight: BOUNDS.minHeight,
    title: 'Moderation logs',
    backgroundColor: '#0a0a0b',
    show: false,
    autoHideMenuBar: true,
    frame: true,
    minimizable: true,
    maximizable: true,
    parent: parent || undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/moderationLogs.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  }
  const win = new BrowserWindow(options)
  restoreAndTrackWindowBounds(win, 'moderationLogs', BOUNDS)
  const closed = new Set<() => void>()

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    for (const cb of closed) cb()
    closed.clear()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/moderation-logs.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/moderation-logs.html'))
  }

  return {
    focus: () => {
      if (win.isMinimized()) win.restore()
      win.focus()
    },
    close: () => win.close(),
    isDestroyed: () => win.isDestroyed(),
    onClosed: (callback) => {
      closed.add(callback)
    },
    send: (channel, payload) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
}
