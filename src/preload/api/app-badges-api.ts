import type { IpcRenderer } from 'electron'
import type { AppBadgeMap } from '../../shared/app-badges'
import type { AppBadgesApi } from '../../shared/contracts/api'
import { IPC } from '../../shared/contracts/ipc'
import { listen } from './listen'

export function createAppBadgesApi(ipc: IpcRenderer): AppBadgesApi {
  return {
    get: () => ipc.invoke(IPC.appBadges.get) as Promise<AppBadgeMap>,
    onChanged: (callback) => listen<AppBadgeMap>(ipc, IPC.appBadges.changed, callback)
  }
}
