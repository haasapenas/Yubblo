import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'path'
import { IPC } from '../../shared/contracts/ipc'
import type { ChannelActivityWindowState } from '../../shared/types'
import type { ChannelActivityPopup } from './channel-activity-window'

export function channelActivityPopupOptions(parent: BrowserWindow | null): BrowserWindowConstructorOptions {
  return {
    width: 420, height: 640, minWidth: 340, minHeight: 420,
    title: 'Channel activity', backgroundColor: '#0f0f0f', show: false,
    autoHideMenuBar: true, parent: parent || undefined,
    frame: false, closable: true,
    webPreferences: { preload: join(__dirname, '../preload/channelActivity.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  }
}

export function createChannelActivityPopup(parent: BrowserWindow | null): ChannelActivityPopup {
  const win = new BrowserWindow(channelActivityPopupOptions(parent))
  let loaded = false
  let latest: ChannelActivityWindowState | null = null
  const closed = new Set<() => void>()
  win.webContents.on('did-finish-load', () => { loaded = true; if (latest) win.webContents.send(IPC.chat.channelActivityWindowState, latest) })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { for (const callback of closed) callback(); closed.clear() })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/channel-activity.html`)
  else void win.loadFile(join(__dirname, '../renderer/channel-activity.html'))
  return {
    focus: () => { if (win.isMinimized()) win.restore(); win.focus() },
    close: () => win.close(),
    isDestroyed: () => win.isDestroyed(),
    onClosed: (callback) => closed.add(callback),
    send: (state) => { latest = state; if (loaded && !win.isDestroyed()) win.webContents.send(IPC.chat.channelActivityWindowState, state) }
  }
}
