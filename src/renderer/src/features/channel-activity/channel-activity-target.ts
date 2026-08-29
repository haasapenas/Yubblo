import type { ChannelActivityTarget, ChatMessage } from '../../../../shared/types'

export function resolveChannelActivityTarget(
  videoId: string | null | undefined,
  message: ChatMessage
): ChannelActivityTarget | null {
  const authorChannelId = message.systemTargetChannelId || message.authorChannelId
  const authorName = message.systemTargetName || message.authorName
  const messageId = message.systemSourceMessageId || message.id

  if (!videoId || !messageId || !authorChannelId || !authorName) return null

  return { videoId, messageId, authorChannelId, authorName }
}
