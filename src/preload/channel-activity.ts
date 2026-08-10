import { contextBridge, ipcRenderer } from 'electron'
import type { ChannelActivityPopupApi } from '../shared/contracts/api'
import type { ChannelActivityWindowState } from '../shared/types'
import { IPC } from '../shared/contracts/ipc'
import { listen } from './api/listen'

const api: ChannelActivityPopupApi = {
  getLocale: async () => (await ipcRenderer.invoke(IPC.settings.get)).locale,
  loadMore: () => ipcRenderer.invoke(IPC.chat.loadMoreChannelActivityWindow),
  close: () => ipcRenderer.invoke(IPC.chat.closeChannelActivityWindow),
  runModeration: (request) => ipcRenderer.invoke(IPC.chat.runChannelActivityModeration, request),
  onState: (callback) => listen<ChannelActivityWindowState>(ipcRenderer, IPC.chat.channelActivityWindowState, callback)
}
contextBridge.exposeInMainWorld('channelActivity', api)
