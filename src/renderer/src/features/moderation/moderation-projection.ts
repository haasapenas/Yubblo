import type { ChatMessage } from '../../../../shared/types'

const CONSOLIDATED_ACTIONS = new Set<ChatMessage['systemKind']>([
  'mod-timeout',
  'mod-hide',
  'mod-unhide'
])

interface IndexedAction {
  index: number
  message: ChatMessage
}

function isConsolidatedAction(message: ChatMessage): boolean {
  return Boolean(
    message.systemTargetChannelId &&
      message.systemKind &&
      CONSOLIDATED_ACTIONS.has(message.systemKind)
  )
}

export function projectModerationMessages(
  messages: readonly ChatMessage[]
): ChatMessage[] {
  const latestByAuthor = new Map<string, IndexedAction>()
  const hiddenActionIndexes = new Set<number>()

  messages.forEach((message, index) => {
    if (!isConsolidatedAction(message)) return

    hiddenActionIndexes.add(index)
    const target = message.systemTargetChannelId!
    const current = latestByAuthor.get(target)
    if (
      !current ||
      message.timestamp > current.message.timestamp ||
      (message.timestamp === current.message.timestamp && index > current.index)
    ) {
      latestByAuthor.set(target, { index, message })
    }
  })

  const replacements = new Map<number, ChatMessage>()
  const removedMessageIndexes = new Set<number>()

  for (const [target, action] of latestByAuthor) {
    let replacementIndex = -1
    let replacementTimestamp = Number.NEGATIVE_INFINITY

    messages.forEach((message, index) => {
      if (
        message.systemKind ||
        message.authorChannelId !== target ||
        message.timestamp > action.message.timestamp
      ) {
        return
      }

      removedMessageIndexes.add(index)
      if (
        message.timestamp > replacementTimestamp ||
        (message.timestamp === replacementTimestamp && index > replacementIndex)
      ) {
        replacementIndex = index
        replacementTimestamp = message.timestamp
      }
    })

    if (replacementIndex >= 0) {
      replacements.set(replacementIndex, action.message)
    } else {
      hiddenActionIndexes.delete(action.index)
    }
  }

  const projected: ChatMessage[] = []
  messages.forEach((message, index) => {
    const replacement = replacements.get(index)
    if (replacement) {
      projected.push(replacement)
      return
    }
    if (hiddenActionIndexes.has(index)) return
    projected.push(
      removedMessageIndexes.has(index) && !message.removed
        ? { ...message, removed: true }
        : message
    )
  })

  return projected
}
