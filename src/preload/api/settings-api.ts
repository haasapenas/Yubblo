import type { IpcRenderer } from 'electron'
import type { YubbloApi } from '../../shared/contracts/api'
import type { AppSettings } from '../../shared/contracts/settings'
import { IPC } from '../../shared/contracts/ipc'
import { listen } from './listen'

export function createSettingsApi(ipc: IpcRenderer): YubbloApi['settings'] {
  return {
    get: () => ipc.invoke(IPC.settings.get),
    setLocale: (locale) => ipc.invoke(IPC.settings.setLocale, locale),
    setChatFontSize: (fontSize) =>
      ipc.invoke(IPC.settings.setChatFontSize, fontSize),
    setPauseChatOnHover: (enabled) =>
      ipc.invoke(IPC.settings.setPauseChatOnHover, enabled),
    setShowFocusModeShortcut: (enabled) =>
      ipc.invoke(IPC.settings.setShowFocusModeShortcut, enabled),
    setHighlights: (rules) => ipc.invoke(IPC.settings.setHighlights, rules),
    setHighlightPreferences: (preferences) =>
      ipc.invoke(IPC.settings.setHighlightPreferences, preferences),
    setMonitoring: (monitoring) => ipc.invoke(IPC.settings.setMonitoring, monitoring),
    chooseHighlightSound: () => ipc.invoke(IPC.settings.chooseHighlightSound),
    readHighlightSound: (path) => ipc.invoke(IPC.settings.readHighlightSound, path),
    setActionButtons: (buttons) => ipc.invoke(IPC.settings.setActionButtons, buttons),
    openWindow: () => ipc.invoke(IPC.settings.openWindow) as Promise<void>,
    onChanged: (callback) => listen<AppSettings>(ipc, IPC.settings.changed, callback)
  }
}
