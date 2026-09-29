import { ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import { setChatThreads } from '../threads/thread-settings'
import { broadcastSettings } from './settings-ipc'

export function registerThreadsIpc(): void {
  ipcMain.handle(IPC.settings.setChatThreads, (_e, enabled: unknown) => {
    const saved = setChatThreads(enabled === true)
    broadcastSettings(saved)
    return saved
  })
}
