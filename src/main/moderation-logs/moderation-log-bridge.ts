/**
 * Adaptador fino entre chat-service e o gravador de logs.
 * Mantém o chat-service sem lógica de disco/JSONL.
 */
import type { ChannelSession } from '../chat/chat-session'
import type { ModerationLogAction } from '../../shared/contracts/moderation-logs'
import { moderationLogRecorder } from './moderation-log-recorder'
import type { StreamContext } from './moderation-log-store'

export function streamContextFromSession(
  session: ChannelSession | null | undefined
): StreamContext | null {
  if (!session?.info?.videoId) return null
  const channelId =
    session.youtubeChannelId ||
    session.info.channelHandle ||
    session.info.channelName ||
    'unknown'
  return {
    channelId: String(channelId),
    channelName: session.info.channelName || String(channelId),
    channelHandle: session.info.channelHandle,
    videoId: session.info.videoId,
    title: session.info.title || session.info.videoId
  }
}

export function recordModerationLog(input: {
  session: ChannelSession | null | undefined
  action: ModerationLogAction
  moderator?: string | null
  user?: string | null
  message?: string | null
  at?: number
}): void {
  const stream = streamContextFromSession(input.session)
  if (!stream) return
  moderationLogRecorder.record({
    action: input.action,
    moderator: input.moderator,
    user: input.user,
    message: input.message,
    at: input.at,
    stream
  })
}

/** Última mensagem conhecida do autor no store em memória. */
export function lastMessageForAuthor(
  findEntries: () => IterableIterator<
    [string, { channelId?: string; name: string; text?: string }]
  >,
  authorChannelId?: string,
  authorName?: string
): string {
  const wantId = (authorChannelId || '').trim()
  const wantName = (authorName || '').trim().toLowerCase().replace(/^@/, '')
  let last = ''
  for (const [, author] of findEntries()) {
    if (wantId && author.channelId && author.channelId === wantId) {
      if (author.text) last = author.text
      continue
    }
    if (!wantId && wantName) {
      const n = (author.name || '').trim().toLowerCase().replace(/^@/, '')
      if (n && n === wantName && author.text) last = author.text
    }
  }
  return last
}
