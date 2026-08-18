import type { ChatMessage } from '../../shared/types'

export type MemberBadgeCacheEntry = {
  url?: string
  label?: string
}

const MAX_MEMBER_BADGES = 500

export function applyMemberBadgeCache(
  cache: Map<string, MemberBadgeCacheEntry>,
  message: ChatMessage
): ChatMessage {
  const authorChannelId = message.authorChannelId
  if (!authorChannelId) return message

  const cached = cache.get(authorChannelId)
  if (message.isMember) {
    const next = {
      url: message.memberBadgeUrl || cached?.url,
      label: message.memberBadgeLabel || cached?.label
    }
    cache.delete(authorChannelId)
    cache.set(authorChannelId, next)
    while (cache.size > MAX_MEMBER_BADGES) {
      const oldest = cache.keys().next().value
      if (!oldest) break
      cache.delete(oldest)
    }
    return {
      ...message,
      memberBadgeUrl: next.url,
      memberBadgeLabel: next.label
    }
  }

  if (!cached) return message
  return {
    ...message,
    isMember: true,
    memberBadgeUrl: cached.url,
    memberBadgeLabel: cached.label
  }
}
