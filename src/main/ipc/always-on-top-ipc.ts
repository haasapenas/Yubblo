import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import { setAlwaysOnTop, setAlwaysOnTopButton } from '../always-on-top/always-on-top'
import { broadcastSettings } from './settings-ipc'

export function registerAlwaysOnTopIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('window:isAlwaysOnTop', () => getWindow()?.isAlwaysOnTop() ?? false)
  ipcMain.handle('window:setAlwaysOnTop', (_e, enabled: unknown) => {
    const saved = setAlwaysOnTop(getWindow(), enabled === true)
    broadcastSettings(saved)
    return getWindow()?.isAlwaysOnTop() ?? saved.alwaysOnTop
  })
  ipcMain.handle(IPC.settings.setAlwaysOnTopButton, (_e, enabled: unknown) => {
    const saved = setAlwaysOnTopButton(getWindow(), enabled === true)
    broadcastSettings(saved)
    return saved
  })
}
