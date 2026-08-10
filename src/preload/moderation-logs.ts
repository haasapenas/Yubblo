import { contextBridge, ipcRenderer } from 'electron'
import type { ModerationLogsPopupApi } from '../shared/contracts/api'
import { IPC } from '../shared/contracts/ipc'
import { listen } from './api/listen'

const api: ModerationLogsPopupApi = {
  getLocale: async () => (await ipcRenderer.invoke(IPC.settings.get)).locale,
  listChannels: () => ipcRenderer.invoke(IPC.moderationLogs.listChannels),
  readPage: (request) => ipcRenderer.invoke(IPC.moderationLogs.readPage, request),
  exportCsv: (payload) =>
    ipcRenderer.invoke(IPC.moderationLogs.exportCsv, payload),
  deleteStream: (streamKey) =>
    ipcRenderer.invoke(IPC.moderationLogs.deleteStream, streamKey),
  close: () => ipcRenderer.invoke(IPC.moderationLogs.closeWindow) as Promise<void>,
  onAppended: (callback) =>
    listen(ipcRenderer, IPC.moderationLogs.appended, callback),
  onError: (callback) =>
    listen(ipcRenderer, IPC.moderationLogs.error, callback)
}

contextBridge.exposeInMainWorld('moderationLogs', api)
