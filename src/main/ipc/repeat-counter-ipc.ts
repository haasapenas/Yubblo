import { ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import { setRepeatCounter } from '../repeat-counter/repeat-counter-settings'
import { broadcastSettings } from './settings-ipc'

export function registerRepeatCounterIpc(): void {
  ipcMain.handle(IPC.settings.setRepeatCounter, (_e, enabled: unknown) => {
    const saved = setRepeatCounter(enabled === true)
    broadcastSettings(saved)
    return saved
  })
}
