import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'path'
import { translateMain } from '../i18n/i18n-main'

export interface UpdatePopup {
  focus(): void
  close(): void
  isDestroyed(): boolean
  onClosed(callback: () => void): void
}

export function createUpdatePopup(parent: BrowserWindow | null): UpdatePopup {
  const options: BrowserWindowConstructorOptions = {
    width: 430, height: 300, minWidth: 390, minHeight: 260,
    title: translateMain('update.title'), backgroundColor: '#0a0a0b', show: false,
    autoHideMenuBar: true, frame: true, minimizable: false, maximizable: false,
    fullscreenable: false, resizable: false, parent: parent || undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/updateWindow.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  }
  const win = new BrowserWindow(options)
  const closed = new Set<() => void>()
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { for (const callback of closed) callback(); closed.clear() })
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/update.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/update.html'))
  }
  return {
    focus: () => win.focus(), close: () => win.close(), isDestroyed: () => win.isDestroyed(),
    onClosed: (callback) => closed.add(callback)
  }
}

