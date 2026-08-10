import type { IpcRenderer } from 'electron'
import type { YubbloApi } from '../../shared/contracts/api'
import { IPC } from '../../shared/contracts/ipc'
import { listen } from './listen'

export function createAuthApi(ipc: IpcRenderer): YubbloApi['auth'] {
  return {
    getState: () => ipc.invoke(IPC.auth.getState),
    login: () => ipc.invoke(IPC.auth.login),
    addAccount: () => ipc.invoke(IPC.auth.addAccount),
    switchChannel: () => ipc.invoke(IPC.auth.switchChannel),
    listChannelIdentities: () => ipc.invoke(IPC.auth.listChannelIdentities),
    switchChannelIdentity: (identityId) =>
      ipc.invoke(IPC.auth.switchChannelIdentity, identityId),
    switchAccount: (accountId) => ipc.invoke(IPC.auth.switchAccount, accountId),
    removeAccount: (accountId) => ipc.invoke(IPC.auth.removeAccount, accountId),
    listAccounts: () => ipc.invoke(IPC.auth.listAccounts),
    logout: () => ipc.invoke(IPC.auth.logout),
    onChanged: (callback) => listen(ipc, IPC.auth.changed, callback)
  }
}
