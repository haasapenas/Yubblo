import type { ChatMessage } from '../../shared/types'
import { formatLocalTime } from './chat-log-paths'

export type ChatLogMessage = Pick<ChatMessage, 'id' | 'authorName' | 'text' | 'timestamp'> &
  Partial<ChatMessage>

export function formatChatLogLine(input: Pick<ChatMessage, 'authorName' | 'text' | 'timestamp'>): string {
  const text = String(input.text || '').replace(/\r\n?|\n/g, ' ')
  const author = String(input.authorName || '').trim() || 'unknown'
  return `[${formatLocalTime(new Date(input.timestamp))}] ${author}: ${text}`
}

export function shouldLogChatMessage(message: Partial<ChatMessage>): boolean {
  return !(
    message.systemKind ||
    message.systemNotice ||
    message.heldForReview ||
    message.removed ||
    message.pending ||
    message.failed ||
    message.awaitingEcho
  )
}
