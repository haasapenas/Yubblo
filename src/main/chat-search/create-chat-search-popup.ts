import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'path'
import { IPC } from '../../shared/contracts/ipc'
import type { ChatSearchWindowState } from '../../shared/contracts/chat-search'

export interface ChatSearchPopup {
  focus(): void
  close(): void
  send(state: ChatSearchWindowState): void
  isDestroyed(): boolean
  onClosed(callback: () => void): void
}

export function createChatSearchPopup(parent: BrowserWindow | null): ChatSearchPopup {
  const options: BrowserWindowConstructorOptions = {
    width: 480,
    height: 640,
    minWidth: 360,
    minHeight: 400,
    title: 'Search chat',
    backgroundColor: '#0a0a0b',
    show: false,
    autoHideMenuBar: true,
    // Title bar nativa: só fechar (sem min/max)
    frame: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    parent: parent || undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/chatSearch.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  }
  const win = new BrowserWindow(options)
  let loaded = false
  let latest: ChatSearchWindowState | null = null
  const closed = new Set<() => void>()

  win.webContents.on('did-finish-load', () => {
    loaded = true
    if (latest) win.webContents.send(IPC.chat.searchWindowState, latest)
  })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    for (const cb of closed) cb()
    closed.clear()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/chat-search.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/chat-search.html'))
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
    send: (state) => {
      latest = state
      if (loaded && !win.isDestroyed()) {
        win.webContents.send(IPC.chat.searchWindowState, state)
      }
    }
  }
}
