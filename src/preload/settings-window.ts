import { contextBridge, ipcRenderer } from 'electron'
import type { SettingsPopupApi } from '../shared/contracts/api'
import type { AppSettings } from '../shared/contracts/settings'
import { IPC } from '../shared/contracts/ipc'
import { listen } from './api/listen'
import { createUpdateApi } from './api/update-api'

const api: SettingsPopupApi = {
  get: () => ipcRenderer.invoke(IPC.settings.get) as Promise<AppSettings>,
  setLocale: (locale) =>
    ipcRenderer.invoke(IPC.settings.setLocale, locale) as Promise<AppSettings>,
  setChatFontSize: (fontSize) =>
    ipcRenderer.invoke(
      IPC.settings.setChatFontSize,
      fontSize
    ) as Promise<AppSettings>,
  setPauseChatOnHover: (enabled) =>
    ipcRenderer.invoke(
      IPC.settings.setPauseChatOnHover,
      enabled
    ) as Promise<AppSettings>,
  setShowFocusModeShortcut: (enabled) =>
    ipcRenderer.invoke(
      IPC.settings.setShowFocusModeShortcut,
      enabled
    ) as Promise<AppSettings>,
  setHighlights: (rules) =>
    ipcRenderer.invoke(IPC.settings.setHighlights, rules) as Promise<AppSettings>,
  setHighlightPreferences: (preferences) =>
    ipcRenderer.invoke(
      IPC.settings.setHighlightPreferences,
      preferences
    ) as Promise<AppSettings>,
  setMonitoring: (monitoring) =>
    ipcRenderer.invoke(IPC.settings.setMonitoring, monitoring) as Promise<AppSettings>,
  chooseHighlightSound: () =>
    ipcRenderer.invoke(IPC.settings.chooseHighlightSound) as Promise<string | null>,
  readHighlightSound: (path) =>
    ipcRenderer.invoke(IPC.settings.readHighlightSound, path),
  setActionButtons: (buttons) =>
    ipcRenderer.invoke(IPC.settings.setActionButtons, buttons) as Promise<AppSettings>,
  close: () => ipcRenderer.invoke(IPC.settings.closeWindow) as Promise<void>,
  openModerationLogs: () =>
    ipcRenderer.invoke(IPC.moderationLogs.openWindow) as Promise<void>,
  update: createUpdateApi(ipcRenderer),
  onChanged: (callback) =>
    listen<AppSettings>(ipcRenderer, IPC.settings.changed, callback)
}

contextBridge.exposeInMainWorld('settingsPopup', api)
