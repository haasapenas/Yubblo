import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type { ChatMessage } from '../../shared/contracts/chat'
import {
  getChatClearCutoff,
  isMessageAfterClear
} from '../chat-clear-store'
import { flushBeforeChatMutation } from '../chat-delivery-order'
import type { ChatService } from '../chat/chat-service'
import {
  applyModerationCutoff,
  clearModerationCutoff,
  getModerationCutoff,
  recordModerationThrough
} from '../moderation/moderation-state-store'

export function registerChatEvents(
  chatService: ChatService,
  getWindow: () => BrowserWindow | null
): void {
  const chatMsgBuf: Array<ChatMessage & { videoId: string }> = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    flushTimer = null
    const window = getWindow()
    if (!chatMsgBuf.length || !window || window.isDestroyed()) {
      chatMsgBuf.length = 0
      return
    }
    for (const message of chatMsgBuf.splice(0, chatMsgBuf.length)) {
      window.webContents.send(IPC.chat.message, message)
    }
  }

  chatService.setHandlers({
    onMessage: (message, videoId) => {
      const clearCutoff = getChatClearCutoff(videoId)
      if (!isMessageAfterClear(message.timestamp, clearCutoff)) return
      const moderationCutoff =
        !message.systemKind && message.authorChannelId
          ? getModerationCutoff(videoId, message.authorChannelId)
          : 0
      chatMsgBuf.push({
        ...applyModerationCutoff(message, moderationCutoff),
        videoId
      })
      if (
        message.isSelf ||
        message.failed ||
        message.pending ||
        message.awaitingEcho
      ) {
        if (flushTimer) clearTimeout(flushTimer)
        flushTimer = null
        flush()
      } else if (!flushTimer) {
        flushTimer = setTimeout(flush, 80)
      }
    },
    onStatus: (status, error, videoId) => {
      getWindow()?.webContents.send(IPC.chat.status, { status, error, videoId })
    },
    onRemoved: (payload) => {
      if (payload.videoId && payload.authorChannelId) {
        if (payload.restored) {
          clearModerationCutoff(payload.videoId, payload.authorChannelId)
        } else if (payload.moderatedThrough) {
          recordModerationThrough(
            payload.videoId,
            payload.authorChannelId,
            payload.moderatedThrough
          )
        }
      }
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = null
      flushBeforeChatMutation(flush, () => {
        getWindow()?.webContents.send(IPC.chat.removed, payload)
      })
    },
    onModMenuReady: (menu) => {
      getWindow()?.webContents.send(IPC.chat.modMenuReady, menu)
    },
    onSessionsChanged: (payload) => {
      getWindow()?.webContents.send(IPC.chat.sessionsChanged, payload)
    },
    onEmotesReady: (videoId) => {
      getWindow()?.webContents.send(IPC.chat.emotesReady, { videoId })
    },
    onHiddenUsersChanged: (list) => {
      getWindow()?.webContents.send(IPC.chat.hiddenUsers, list)
    },
    onLivePoll: (poll) => {
      getWindow()?.webContents.send(IPC.chat.livePoll, poll)
    },
    onPinnedMessage: (pin) => {
      getWindow()?.webContents.send(IPC.chat.pinnedMessage, pin)
    }
  })
}
