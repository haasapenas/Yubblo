import { contextBridge, ipcRenderer } from 'electron'
import type { ChatSearchPopupApi } from '../shared/contracts/api'
import type { ChatSearchWindowState } from '../shared/contracts/chat-search'
import { IPC } from '../shared/contracts/ipc'
import { listen } from './api/listen'

const api: ChatSearchPopupApi = {
  getLocale: async () => (await ipcRenderer.invoke(IPC.settings.get)).locale,
  close: () => ipcRenderer.invoke(IPC.chat.closeSearchWindow) as Promise<void>,
  getModMenu: (messageId, videoId) =>
    ipcRenderer.invoke(IPC.chat.getModMenu, messageId, videoId),
  runModAction: (messageId, iconType, videoId) =>
    ipcRenderer.invoke(IPC.chat.runModAction, messageId, iconType, videoId),
  onState: (callback) =>
    listen<ChatSearchWindowState>(ipcRenderer, IPC.chat.searchWindowState, callback)
}

contextBridge.exposeInMainWorld('chatSearch', api)
