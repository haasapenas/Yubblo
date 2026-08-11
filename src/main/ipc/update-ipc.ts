import { ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type { UpdateService } from '../updater/update-service'
import type { UpdateWindowController } from '../updater/update-window-controller'

export function registerUpdateIpc(service: UpdateService, controller: UpdateWindowController): void {
  ipcMain.handle(IPC.update.getState, () => service.getState())
  ipcMain.handle(IPC.update.check, () => service.check(true))
  ipcMain.handle(IPC.update.download, () => service.download())
  ipcMain.handle(IPC.update.install, () => service.install())
  ipcMain.handle(IPC.update.openWindow, () => controller.open())
  ipcMain.handle(IPC.update.closeWindow, () => controller.close())
}
