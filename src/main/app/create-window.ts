import { BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { restoreAndTrackWindowBounds } from '../window-bounds'
import { BRAND } from '../../shared/brand'

export interface CreateMainWindowOptions {
  onClosed: () => void
}

const MAIN_BOUNDS_DEFAULTS = {
  width: 440,
  height: 820,
  minWidth: 360,
  minHeight: 520
}

export function createMainWindow({
  onClosed
}: CreateMainWindowOptions): BrowserWindow {
  nativeTheme.themeSource = 'dark'
  // Janela em pé (chat popout) — mais vertical que horizontal
  // Windows/Linux: frameless + botões min/max/close na topbar (integrados ao tema).
  // macOS: traffic lights nativos (hiddenInset).
  const win = new BrowserWindow({
    width: MAIN_BOUNDS_DEFAULTS.width,
    height: MAIN_BOUNDS_DEFAULTS.height,
    minWidth: MAIN_BOUNDS_DEFAULTS.minWidth,
    minHeight: MAIN_BOUNDS_DEFAULTS.minHeight,
    title: BRAND.displayName,
    icon: process.env.ELECTRON_RENDERER_URL
      ? join(process.cwd(), 'build', 'icon.png')
      : undefined,
    backgroundColor: '#0a0a0b',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const }
      : {
          frame: false,
          // Garante borda/sombra nativa no Windows 11 sem title bar branca
          transparent: false,
          hasShadow: true
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  restoreAndTrackWindowBounds(win, 'main', MAIN_BOUNDS_DEFAULTS)
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details)
  })
  win.webContents.on('preload-error', (_e, path, error) => {
    console.error('[preload-error]', path, error)
  })
  if (process.env[BRAND.debugEnv] === '1') {
    win.webContents.openDevTools({ mode: 'detach' })
  }
  win.once('ready-to-show', () => win.show())
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html')
    console.log('[main] loading', htmlPath)
    void win.loadFile(htmlPath)
  }
  win.on('closed', onClosed)
  return win
}
