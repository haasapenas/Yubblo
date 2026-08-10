import type { ChatMessage } from '../../../../shared/types'

export function buildDeletedMessageIndex(
  messages: readonly ChatMessage[]
): ReadonlyMap<string, string> {
  const textById = new Map<string, string>()
  for (const message of messages) {
    textById.set(message.id, message.text?.trim() || '')
  }

  const result = new Map<string, string>()
  for (const message of messages) {
    if (message.systemKind !== 'mod-delete') continue
    const text = message.systemDeletedText?.trim() ||
      (message.systemSourceMessageId
        ? textById.get(message.systemSourceMessageId)
        : '') ||
      ''
    if (text && text !== '(sem texto)') result.set(message.id, text)
  }
  return result
}