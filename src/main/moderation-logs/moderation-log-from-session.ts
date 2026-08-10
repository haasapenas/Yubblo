/**
 * Atalhos de captura usados pelo chat-service (1 chamada por ponto de gancho).
 */
import type { ChannelSession } from '../chat/chat-session'
import type { IncomingModerationEvent } from '../moderation/moderation-activity'
import {
  lastMessageForAuthor,
  recordModerationLog
} from './moderation-log-bridge'

type AuthorLookup = {
  findAuthor(
    messageId: string
  ): { channelId?: string; name: string; text?: string } | undefined
  authorEntries(): IterableIterator<
    [string, { channelId?: string; name: string; text?: string }]
  >
}

export function logLocalDelete(opts: {
  session: ChannelSession
  moderator: string
  user: string
  message: string
}): void {
  recordModerationLog({
    session: opts.session,
    action: 'deleted',
    moderator: opts.moderator,
    user: opts.user,
    message: opts.message
  })
}

export function logLocalTimeoutOrHide(opts: {
  session: ChannelSession
  action: 'timeout' | 'hide'
  moderator: string
  user: string
  messageId: string
  targetChannelId?: string
  store: AuthorLookup
  storedText?: string
  at: number
}): void {
  const text =
    opts.store.findAuthor(opts.messageId)?.text?.trim() ||
    opts.storedText?.trim() ||
    lastMessageForAuthor(
      () => opts.store.authorEntries(),
      opts.targetChannelId,
      opts.user
    )
  recordModerationLog({
    session: opts.session,
    action: opts.action,
    moderator: opts.moderator,
    user: opts.user,
    message: text,
    at: opts.at
  })
}

export function logIncomingModeration(
  session: ChannelSession | undefined,
  event: IncomingModerationEvent,
  store: AuthorLookup
): void {
  recordModerationLog({
    session,
    action: event.kind === 'delete' ? 'deleted' : event.kind,
    moderator: event.moderatorName,
    user: event.targetName,
    message: event.messageId
      ? store.findAuthor(event.messageId)?.text?.trim() || ''
      : lastMessageForAuthor(
          () => store.authorEntries(),
          event.authorChannelId,
          event.targetName
        ),
    at: event.timestamp || Date.now()
  })
}

export function logExternalDelete(
  session: ChannelSession | undefined,
  messageId: string,
  store: AuthorLookup,
  stored?: { authorName?: string; text?: string }
): void {
  const meta = store.findAuthor(messageId)
  recordModerationLog({
    session,
    action: 'deleted',
    user: meta?.name || stored?.authorName,
    message: meta?.text?.trim() || stored?.text?.trim() || ''
  })
}
