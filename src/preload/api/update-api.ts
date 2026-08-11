import type { IpcRenderer } from 'electron'
import type { AppUpdateApi } from '../../shared/contracts/api'
import type { AppUpdateState } from '../../shared/contracts/update'
import { IPC } from '../../shared/contracts/ipc'
import { listen } from './listen'

export function createUpdateApi(ipc: IpcRenderer): AppUpdateApi {
  return {
    getState: () => ipc.invoke(IPC.update.getState) as Promise<AppUpdateState>,
    check: () => ipc.invoke(IPC.update.check) as Promise<AppUpdateState>,
    download: () => ipc.invoke(IPC.update.download) as Promise<AppUpdateState>,
    install: () => ipc.invoke(IPC.update.install) as Promise<void>,
    openWindow: () => ipc.invoke(IPC.update.openWindow) as Promise<void>,
    onChanged: (callback) =>
      listen<AppUpdateState>(ipc, IPC.update.changed, callback)
  }
}
