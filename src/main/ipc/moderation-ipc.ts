import { ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type { ChatService } from '../chat/chat-service'

function appError(error: unknown, fallback: string, messageKey: string): Error {
  const value = error as {
    code?: string
    message?: string
    messageKey?: string
    params?: Record<string, string | number>
  }
  return new Error(
    JSON.stringify({
      code: value.code || 'UNKNOWN',
      message: value.message || fallback,
      messageKey: value.messageKey || messageKey,
      params: value.params
    })
  )
}

export function registerModerationIpc(chatService: ChatService): void {
  ipcMain.handle(IPC.chat.getModMenu, async (_e, messageId: string, videoId: string) => {
    try {
      return await chatService.getModMenu(messageId, videoId)
    } catch (error) {
      throw appError(error, 'Could not open moderation menu', 'errors.moderationMenuFailed')
    }
  })
  ipcMain.handle(IPC.chat.prefetchModMenu, async (_e, messageId: string, videoId: string) => {
    chatService.queueModPrefetch(messageId, videoId)
  })
  ipcMain.handle(
    IPC.chat.runModAction,
    async (_e, messageId: string, iconType: string, videoId: string) => {
      try {
        return await chatService.runModAction(messageId, iconType, videoId)
      } catch (error) {
      throw appError(error, 'Could not apply moderation action', 'errors.moderationActionFailed')
      }
    }
  )
  ipcMain.handle(IPC.chat.listHiddenUsers, async () => chatService.listHiddenUsers())
  ipcMain.handle(IPC.chat.unhideUser, async (_e, channelId: string) => {
    try {
      await chatService.unhideUser(String(channelId || ''))
    } catch (error) {
      throw appError(error, 'Could not unban user', 'errors.unhideFailed')
    }
  })
}
