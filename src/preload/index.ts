import { contextBridge, ipcRenderer } from 'electron'
import type { YubbloApi } from '../shared/contracts/api'
import { createAuthApi } from './api/auth-api'
import { createChatApi } from './api/chat-api'
import { createModerationLogsApi } from './api/moderation-logs-api'
import { createSettingsApi } from './api/settings-api'

const api: YubbloApi = {
  auth: createAuthApi(ipcRenderer),
  chat: createChatApi(ipcRenderer),
  settings: createSettingsApi(ipcRenderer),
  moderationLogs: createModerationLogsApi(ipcRenderer),
  window: {
    platform: () => ipcRenderer.invoke('window:platform') as Promise<NodeJS.Platform>,
    minimize: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
    maximize: () => ipcRenderer.invoke('window:maximize') as Promise<boolean>,
    close: () => ipcRenderer.invoke('window:close') as Promise<void>,
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>
  }
}

contextBridge.exposeInMainWorld('yubblo', api)
