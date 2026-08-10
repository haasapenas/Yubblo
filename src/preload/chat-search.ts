import { contextBridge, ipcRenderer } from 'electron'
import type { ChatSearchPopupApi } from '../shared/contracts/api'
import type { ChatSearchWindowState } from '../shared/contracts/chat-search'
import { IPC } from '../shared/contracts/ipc'
import { listen } from './api/listen'

const api: ChatSearchPopupApi = {
  getLocale: async () => (await ipcRenderer.invoke(IPC.settings.get)).locale,
  close: () => ipcRenderer.invoke(IPC.chat.closeSearchWindow) as Promise<void>,
  onState: (callback) =>
    listen<ChatSearchWindowState>(ipcRenderer, IPC.chat.searchWindowState, callback)
}

contextBridge.exposeInMainWorld('chatSearch', api)
