import type { ChatMessage } from '../../../../shared/types'
import type { AppBadgeId } from '../../../../shared/app-badges'

export function selfChannelIdFrom(messages: readonly ChatMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.isSelf && message.authorChannelId) return message.authorChannelId
  }
  return undefined
}

export function appBadgeFor(
  message: ChatMessage,
  badges: ReadonlyMap<string, AppBadgeId> | undefined,
  selfChannelId: string | undefined
): AppBadgeId | undefined {
  if (!badges?.size) return undefined
  const own = message.authorChannelId ? badges.get(message.authorChannelId) : undefined
  if (own || !message.isSelf || !selfChannelId) return own
  return badges.get(selfChannelId)
}
