import { ipcMain } from 'electron'
import type { ChatService } from '../chat/chat-service'
import type { ChannelActivityHandleInput, ChannelActivityModerationRequest, ChannelActivityTarget } from '../../shared/types'
import { IPC } from '../../shared/contracts/ipc'
import type { ChannelActivityWindowController } from '../channel-activity/channel-activity-window'


export function validateChannelActivityModerationRequest(value: unknown): ChannelActivityModerationRequest {
  const request = value as Partial<ChannelActivityModerationRequest> | null
  const valid = request &&
    typeof request.videoId === 'string' && request.videoId.trim().length > 0 && request.videoId.length <= 200 &&
    typeof request.messageId === 'string' && request.messageId.trim().length > 0 && request.messageId.length <= 500 &&
    typeof request.authorChannelId === 'string' && request.authorChannelId.trim().length > 0 && request.authorChannelId.length <= 200 &&
    typeof request.iconType === 'string' && request.iconType.trim().length > 0 && request.iconType.length <= 200
  if (!valid) throw new Error('Invalid channel activity moderation request')
  return request as ChannelActivityModerationRequest
}
export function registerChannelActivityIpc(chatService: ChatService, controller: ChannelActivityWindowController): void {
  ipcMain.handle(IPC.chat.openChannelActivityWindow, (_event, target: ChannelActivityTarget) => {
    if (!target || typeof target.videoId !== 'string' || typeof target.messageId !== 'string' || typeof target.authorChannelId !== 'string' || typeof target.authorName !== 'string') throw new Error('Invalid channel activity target')
    return controller.open(target)
  })
  ipcMain.handle(IPC.chat.openChannelActivityByHandle, async (_event, input: ChannelActivityHandleInput) => {
    if (!input || typeof input.videoId !== 'string' || typeof input.handle !== 'string' || !input.videoId.trim() || !input.handle.trim() || input.handle.length > 100) throw new Error('Invalid /user target')
    const target = await chatService.channelActivity.resolveTarget(input)
    return controller.open(target)
  })
  ipcMain.handle(IPC.chat.runChannelActivityModeration, (_event, value: unknown) => {
    const request = validateChannelActivityModerationRequest(value)
    const current = controller.currentTarget()
    if (!current || current.videoId !== request.videoId || current.messageId !== request.messageId || current.authorChannelId !== request.authorChannelId) {
      throw new Error('Channel activity target changed')
    }
    return controller.runModeration(request.iconType)
  })
  ipcMain.handle(IPC.chat.loadMoreChannelActivityWindow, () => controller.loadMore())
  ipcMain.handle(IPC.chat.closeChannelActivityWindow, () => controller.close())
}
