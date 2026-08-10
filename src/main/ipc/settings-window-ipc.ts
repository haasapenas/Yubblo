import { ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type { SettingsWindowController } from '../settings-window/settings-window-controller'

export function registerSettingsWindowIpc(controller: SettingsWindowController): void {
  ipcMain.handle(IPC.settings.openWindow, () => {
    controller.open()
  })
  ipcMain.handle(IPC.settings.closeWindow, () => {
    controller.close()
  })
}
