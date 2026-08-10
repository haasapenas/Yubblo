import type { IpcRenderer } from 'electron'
import type { YubbloApi } from '../../shared/contracts/api'
import { IPC } from '../../shared/contracts/ipc'
import { listen } from './listen'

export function createChatApi(ipc: IpcRenderer): YubbloApi['chat'] {
  return {
    openByChannel: (input, options) =>
      ipc.invoke(IPC.chat.openByChannel, input, options),
    listChannelLives: (input) => ipc.invoke(IPC.chat.listChannelLives, input),
    switchSession: (videoId) => ipc.invoke(IPC.chat.switchSession, videoId),
    closeSession: (videoId) => ipc.invoke(IPC.chat.closeSession, videoId),
    listSessions: () => ipc.invoke(IPC.chat.listSessions),
    send: (text) => ipc.invoke(IPC.chat.send, text),
    clear: (videoId) => ipc.invoke(IPC.chat.clear, videoId),
    stop: () => ipc.invoke(IPC.chat.stop),
    getEmoteCatalog: (videoId) => ipc.invoke(IPC.chat.getEmoteCatalog, videoId ?? null),
    getModMenu: (messageId, videoId) =>
      ipc.invoke(IPC.chat.getModMenu, messageId, videoId),
    openChannelActivityWindow: (target) => ipc.invoke(IPC.chat.openChannelActivityWindow, target),
    openChannelActivityByHandle: (input) => ipc.invoke(IPC.chat.openChannelActivityByHandle, input),
    openSearchWindow: (state) => ipc.invoke(IPC.chat.openSearchWindow, state),
    prefetchModMenu: (messageId, videoId) =>
      ipc.invoke(IPC.chat.prefetchModMenu, messageId, videoId),
    runModAction: (messageId, iconType, videoId) =>
      ipc.invoke(IPC.chat.runModAction, messageId, iconType, videoId),
    listHiddenUsers: () => ipc.invoke(IPC.chat.listHiddenUsers),
    unhideUser: (channelId) => ipc.invoke(IPC.chat.unhideUser, channelId),
    onHiddenUsersChanged: (callback) => listen(ipc, IPC.chat.hiddenUsers, callback),
    onMessage: (callback) => listen(ipc, IPC.chat.message, callback),
    onStatus: (callback) => listen(ipc, IPC.chat.status, callback),
    onRemoved: (callback) => listen(ipc, IPC.chat.removed, callback),
    onEmotesReady: (callback) => listen(ipc, IPC.chat.emotesReady, callback),
    onModMenuReady: (callback) => listen(ipc, IPC.chat.modMenuReady, callback),
    onSessionsChanged: (callback) => listen(ipc, IPC.chat.sessionsChanged, callback),
    getLivePoll: (videoId) => ipc.invoke(IPC.chat.getLivePoll, videoId ?? null),
    voteLivePoll: (pollId, optionId, videoId) =>
      ipc.invoke(IPC.chat.voteLivePoll, pollId, optionId, videoId ?? null),
    dismissLivePoll: (pollId, videoId) =>
      ipc.invoke(IPC.chat.dismissLivePoll, pollId ?? null, videoId ?? null),
    onLivePoll: (callback) => listen(ipc, IPC.chat.livePoll, callback),
    getPinnedMessage: (videoId) =>
      ipc.invoke(IPC.chat.getPinnedMessage, videoId ?? null),
    dismissPinnedMessage: (pinId, videoId) =>
      ipc.invoke(IPC.chat.dismissPinnedMessage, pinId ?? null, videoId ?? null),
    onPinnedMessage: (callback) => listen(ipc, IPC.chat.pinnedMessage, callback)
  }
}
