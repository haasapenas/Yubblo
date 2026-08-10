import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'path'
import { restoreAndTrackWindowBounds } from '../window-bounds'

export interface SettingsPopup {
  focus(): void
  close(): void
  isDestroyed(): boolean
  onClosed(callback: () => void): void
}

const SETTINGS_BOUNDS_DEFAULTS = {
  width: 1000,
  height: 720,
  minWidth: 900,
  minHeight: 640
}

export function createSettingsPopup(parent: BrowserWindow | null): SettingsPopup {
  const options: BrowserWindowConstructorOptions = {
    width: SETTINGS_BOUNDS_DEFAULTS.width,
    height: SETTINGS_BOUNDS_DEFAULTS.height,
    minWidth: SETTINGS_BOUNDS_DEFAULTS.minWidth,
    minHeight: SETTINGS_BOUNDS_DEFAULTS.minHeight,
    title: 'Settings',
    backgroundColor: '#0a0a0b',
    show: false,
    autoHideMenuBar: true,
    frame: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    parent: parent || undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/settingsWindow.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  }
  const win = new BrowserWindow(options)
  restoreAndTrackWindowBounds(win, 'settings', SETTINGS_BOUNDS_DEFAULTS)
  const closed = new Set<() => void>()

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    for (const cb of closed) cb()
    closed.clear()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/settings.html'))
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
    }
  }
}
