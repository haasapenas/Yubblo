import { contextBridge, ipcRenderer } from 'electron'
import type { UpdatePopupApi } from '../shared/contracts/api'
import type { AppLocale } from '../shared/i18n/locale'
import { IPC } from '../shared/contracts/ipc'
import { createUpdateApi } from './api/update-api'

const api: UpdatePopupApi = {
  ...createUpdateApi(ipcRenderer),
  getLocale: () => ipcRenderer.invoke(IPC.settings.get).then((s) => s.locale as AppLocale),
  close: () => ipcRenderer.invoke(IPC.update.closeWindow) as Promise<void>
}

contextBridge.exposeInMainWorld('updatePopup', api)
