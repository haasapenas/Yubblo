import type { ChatMessage, LiveSessionInfo } from '../../shared/types'
import type { ChatLogsSettings } from '../../shared/contracts/settings'
import { loadSettings } from '../settings-store'
import { shouldLogChatMessage, formatChatLogLine } from './chat-log-format'
import { normalizeChannelKey } from './chat-log-paths'
import { ChatLogStore, type ChatLogAppendContext } from './chat-log-store'

export type ChatLogMessageSource = 'live' | 'bootstrap'

export interface ChatLogStoreLike {
  enqueueAppend(context: ChatLogAppendContext, at?: Date): Promise<void>
  flush(): Promise<void>
}

export class ChatLogRecorder {
  private readonly recentIds = new Map<string, string[]>()

  constructor(
    private readonly store: ChatLogStoreLike = new ChatLogStore(),
    private readonly getSettings: () => ChatLogsSettings = () => loadSettings().chatLogs
  ) {}

  record(
    message: ChatMessage,
    session: LiveSessionInfo | undefined,
    source: ChatLogMessageSource = 'live'
  ): void {
    try {
      if (source === 'bootstrap' || !session?.videoId) return
      const settings = this.getSettings()
      if (!settings.enabled || !shouldLogChatMessage(message)) return

      const channelCandidates = (session.channelHandle
        ? [session.channelHandle]
        : [session.input, session.channelName]
      )
        .map((value) => normalizeChannelKey(value || ''))
        .filter(Boolean)
      const channelKey = normalizeChannelKey(
        session.channelHandle || session.channelName || session.input || session.videoId
      )
      if (
        settings.onlyListedChannels &&
        !settings.channels.some((channel) => {
          const listed = normalizeChannelKey(channel)
          return listed !== '' && channelCandidates.includes(listed)
        })
      ) {
        return
      }

      const messageId = String(message.id || '').trim()
      if (!messageId || this.wasRecentlyRecorded(session.videoId, messageId)) return

      const line = formatChatLogLine(message)
      void this.store
        .enqueueAppend({
          channelKey,
          videoId: session.videoId,
          title: session.title || session.videoId,
          line
        }, new Date(message.timestamp))
        .catch((error) => {
          console.warn('[chat-logs] record failed', error)
        })
    } catch (error) {
      console.warn('[chat-logs] record skipped', error)
    }
  }

  flush(): Promise<void> {
    return this.store.flush()
  }

  private wasRecentlyRecorded(videoId: string, messageId: string): boolean {
    const ids = this.recentIds.get(videoId) || []
    if (ids.includes(messageId)) return true
    ids.push(messageId)
    if (ids.length > 400) ids.splice(0, ids.length - 400)
    this.recentIds.set(videoId, ids)
    return false
  }
}

export const chatLogRecorder = new ChatLogRecorder()
