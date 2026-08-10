import type { ChatMessage, HighlightRule } from '../../../../shared/types'
import {
  findHighlight,
  type SelfHighlightInput
} from '../settings/highlights'

export function filterMessagesForFocus(
  messages: ChatMessage[],
  enabled: boolean,
  rules: HighlightRule[],
  self?: SelfHighlightInput
): ChatMessage[] {
  if (!enabled) return messages
  return messages.filter((message) =>
    message.heldForReview === true || findHighlight(message, rules, self) !== null
  )
}
