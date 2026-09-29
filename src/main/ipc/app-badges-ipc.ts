import { ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type { AppBadgesService } from '../app-badges/app-badges-service'

export function registerAppBadgesIpc(service: AppBadgesService): void {
  ipcMain.handle(IPC.appBadges.get, () => service.get())
}
