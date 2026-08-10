import { ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type { OpenChannelOpts } from '../../shared/contracts/chat'
import { clearChatThrough } from '../chat-clear-store'
import type { ChatService } from '../chat/chat-service'

function serializedError(
  error: unknown,
  code: string,
  fallback: string,
  messageKey: string
): Error {
  const value = error as {
    code?: string
    message?: string
    messageKey?: string
    params?: Record<string, string | number>
  }
  return new Error(
    JSON.stringify({
      code: value.code || code,
      message: value.message || fallback,
      messageKey: value.messageKey || messageKey,
      params: value.params
    })
  )
}

function requireLogin(isLoggedIn: () => boolean): void {
  if (!isLoggedIn()) {
    throw serializedError(null, 'NOT_LOGGED_IN', 'Login required', 'errors.loginRequired')
  }
}

export function registerChatIpc(
  chatService: ChatService,
  isLoggedIn: () => boolean
): void {
  ipcMain.handle(
    IPC.chat.openByChannel,
    async (_e, input: string, opts?: OpenChannelOpts) => {
      try {
        return await chatService.openByChannel(input, opts)
      } catch (error) {
        throw serializedError(error, 'UNKNOWN', 'Could not open chat', 'errors.chatOpenFailed')
      }
    }
  )
  ipcMain.handle(IPC.chat.listChannelLives, async (_e, input: string) => {
    try {
      return await chatService.listChannelLives(String(input || ''))
    } catch (error) {
      throw serializedError(error, 'UNKNOWN', 'Could not list live streams', 'errors.chatListFailed')
    }
  })
  ipcMain.handle(IPC.chat.send, async (_e, text: string) => {
    try {
      requireLogin(isLoggedIn)
      await chatService.sendMessage(text)
    } catch (error) {
      throw serializedError(error, 'SEND_FAILED', 'Could not send message', 'errors.sendFailed')
    }
  })
  ipcMain.handle(IPC.chat.clear, (_event, videoId: string) => {
    const active = chatService.listSessions().activeVideoId
    if (!active || active !== videoId) {
      throw serializedError(null, 'UNKNOWN', 'Only the active tab can be cleared', 'errors.clearActiveOnly')
    }
    return clearChatThrough(videoId)
  })
  ipcMain.handle(IPC.chat.stop, async () => chatService.stopChat())
  ipcMain.handle(IPC.chat.switchSession, async (_e, videoId: string) => {
    return chatService.switchSession(videoId)
  })
  ipcMain.handle(IPC.chat.closeSession, async (_e, videoId: string) => {
    return chatService.closeSession(videoId)
  })
  ipcMain.handle(IPC.chat.listSessions, async () => chatService.listSessions())
  ipcMain.handle(IPC.chat.getLivePoll, async (_e, videoId: string | null) => {
    return chatService.getLivePoll(videoId)
  })
  ipcMain.handle(
    IPC.chat.voteLivePoll,
    async (_e, pollId: string, optionId: string, videoId: string | null) => {
      try {
        return await chatService.voteLivePoll(pollId, optionId, videoId)
      } catch (error) {
        throw serializedError(error, 'UNKNOWN', 'Could not vote in the poll', 'errors.pollVoteFailed')
      }
    }
  )
  ipcMain.handle(
    IPC.chat.dismissLivePoll,
    async (_e, pollId: string | null, videoId: string | null) => {
      chatService.dismissLivePoll(pollId, videoId)
    }
  )
  ipcMain.handle(IPC.chat.getPinnedMessage, async (_e, videoId: string | null) => {
    return chatService.getPinnedMessage(videoId)
  })
  ipcMain.handle(
    IPC.chat.dismissPinnedMessage,
    async (_e, pinId: string | null, videoId: string | null) => {
      chatService.dismissPinnedMessage(pinId, videoId)
    }
  )
  ipcMain.handle(IPC.chat.getEmoteCatalog, async (_e, videoId: string | null) => {
    return chatService.getEmoteCatalog(videoId)
  })
}
