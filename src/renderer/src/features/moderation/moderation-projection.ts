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

function authorRemovalTombstone(
  message: ChatMessage,
  action: ChatMessage
): ChatMessage {
  return {
    ...message,
    text: action.text,
    parts: undefined,
    removed: true,
    pending: false,
    failed: false,
    awaitingEcho: false,
    hasContextMenu: false,
    heldForReview: false,
    heldHeader: undefined,
    heldActions: undefined,
    systemKind: action.systemKind,
    systemTargetChannelId: action.systemTargetChannelId,
    systemTargetName: action.systemTargetName || message.authorName,
    systemModeratorName: action.systemModeratorName,
    systemDurationKey: action.systemDurationKey,
    systemDeletedText: message.systemDeletedText || message.text,
    systemDeletedParts: message.systemDeletedParts || message.parts,
    systemSourceMessageId: message.systemSourceMessageId || message.id
  }
}

function isConsolidatedAction(message: ChatMessage): boolean {
  return Boolean(
    message.systemTargetChannelId &&
      message.systemKind &&
      CONSOLIDATED_ACTIONS.has(message.systemKind)
  )
}

export function latestBanTombstoneIds(
  messages: readonly ChatMessage[]
): ReadonlySet<string> {
  const latestByAuthor = new Map<string, IndexedAction>()

  messages.forEach((message, index) => {
    if (message.systemKind !== 'mod-hide' || !message.systemTargetChannelId) return
    const current = latestByAuthor.get(message.systemTargetChannelId)
    if (
      !current ||
      message.timestamp > current.message.timestamp ||
      (message.timestamp === current.message.timestamp && index > current.index)
    ) {
      latestByAuthor.set(message.systemTargetChannelId, { index, message })
    }
  })

  const ids = new Set<string>()
  messages.forEach((message) => {
    const target = message.systemTargetChannelId
    if (target && latestByAuthor.get(target)?.message.id === message.id) {
      ids.add(message.id)
    }
  })
  return ids
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
    const affectedIndexes: number[] = []
    let replacementIndex = -1
    let replacementTimestamp = Number.NEGATIVE_INFINITY

    messages.forEach((message, index) => {
      if (
        index >= action.index ||
        message.systemKind ||
        message.authorChannelId !== target ||
        message.timestamp > action.message.timestamp
      ) {
        return
      }

      affectedIndexes.push(index)
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
      if (
        action.message.systemKind === 'mod-timeout' ||
        action.message.systemKind === 'mod-hide'
      ) {
        affectedIndexes.forEach((index) => {
          replacements.set(
            index,
            authorRemovalTombstone(messages[index], action.message)
          )
        })
      } else {
        replacements.set(replacementIndex, action.message)
      }
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
