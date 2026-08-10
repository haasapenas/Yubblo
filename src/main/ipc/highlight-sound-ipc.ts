import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import {
  chooseHighlightSound,
  readHighlightSound
} from '../highlight-sounds/highlight-sound-service'

export function registerHighlightSoundIpc(): void {
  ipcMain.handle(IPC.settings.chooseHighlightSound, (event) =>
    chooseHighlightSound(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle(IPC.settings.readHighlightSound, (_event, path: unknown) =>
    readHighlightSound(typeof path === 'string' ? path : ''))
}
