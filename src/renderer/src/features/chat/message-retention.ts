import type { ChatMessage } from '../../../../shared/types'

export const CHAT_MESSAGES_RESUME_KEEP = 300
export const CHAT_MESSAGES_PAUSED_MAX = 500

export function retainChatMessages(
  messages: ChatMessage[],
  paused: boolean
): ChatMessage[] {
  const limit = paused
    ? CHAT_MESSAGES_PAUSED_MAX
    : CHAT_MESSAGES_RESUME_KEEP
  return messages.length > limit ? messages.slice(-limit) : messages
}