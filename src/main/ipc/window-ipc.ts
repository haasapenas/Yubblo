import { ipcMain, type BrowserWindow } from 'electron'

/**
 * Controles da janela (min/max/fechar) para topbar custom no Windows/Linux.
 * Com frame:false os botões nativos do SO somem — a UI desenha os do app.
 */
export function registerWindowIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('window:minimize', () => {
    getWindow()?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = getWindow()
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })

  ipcMain.handle('window:close', () => {
    getWindow()?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return getWindow()?.isMaximized() ?? false
  })

  ipcMain.handle('window:platform', () => process.platform)
}
