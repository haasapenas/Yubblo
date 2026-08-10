import type { IpcRenderer } from 'electron'
import type { YubbloApi } from '../../shared/contracts/api'
import { IPC } from '../../shared/contracts/ipc'

export function createModerationLogsApi(
  ipc: IpcRenderer
): YubbloApi['moderationLogs'] {
  return {
    openWindow: () =>
      ipc.invoke(IPC.moderationLogs.openWindow) as Promise<void>
  }
}
