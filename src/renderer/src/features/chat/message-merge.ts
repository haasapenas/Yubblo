import type { ChatMessage } from '../../../../shared/types'
import { retainChatMessages } from './message-retention'

export function appendInFeedOrder(
  previous: ChatMessage[],
  message: ChatMessage,
  paused = false
): ChatMessage[] {
  if (previous.at(-1)?.id === message.id) return previous
  if (previous.length > 40) {
    if (previous.slice(-40).some((item) => item.id === message.id)) {
      const index = previous.findIndex((item) => item.id === message.id)
      if (index >= 0) {
        const copy = [...previous]
        copy[index] = { ...copy[index], ...message }
        return copy
      }
    }
  } else if (previous.some((item) => item.id === message.id)) {
    return previous
  }
  const latest = previous.at(-1)
  const feedMessage =
    message.systemKind?.startsWith('mod-') &&
    latest &&
    latest.timestamp > message.timestamp
      ? { ...message, timestamp: latest.timestamp }
      : message

  return retainChatMessages([...previous, feedMessage], paused)
}

export function mergeChatMessage(
  previous: ChatMessage[],
  message: ChatMessage,
  paused = false
): ChatMessage[] {
  if (message.failed) return previous.filter((item) => item.id !== message.id)

  if (message.removed) {
    const index = previous.findIndex(
      (item) =>
        item.id === message.id ||
        (message.replacesId && item.id === message.replacesId)
    )
    if (index < 0) return previous
    const copy = [...previous]
    copy[index] = { ...copy[index], ...message, removed: true }
    return copy
  }

  if (message.replacesId) {
    const index = previous.findIndex(
      (item) => item.id === message.replacesId || item.id === message.id
    )
    if (index >= 0) {
      const copy = [...previous]
      const { replacesId: _replacesId, ...rest } = message
      const old = copy[index]!
      copy[index] = {
        ...old,
        ...rest,
        id: message.id,
        isSelf: !!(message.isSelf || old.isSelf || old.awaitingEcho),
        pending: false,
        failed: false,
        awaitingEcho: false,
        heldForReview: message.heldForReview ?? false,
        heldHeader: message.heldHeader,
        heldActions: message.heldActions,
        hasContextMenu: message.hasContextMenu ?? old.hasContextMenu ?? true,
        authorName: message.authorName || old.authorName,
        isModerator: !!(message.isModerator || old.isModerator),
        isMember: !!(message.isMember || old.isMember),
        isOwner: !!(message.isOwner || old.isOwner),
        isVerified: !!(message.isVerified || old.isVerified)
      }
      return copy
    }
  }

  const existingIndex = previous.findIndex((item) => item.id === message.id)
  if (existingIndex >= 0) {
    const old = previous[existingIndex]!
    const keepHeld =
      !!old.heldForReview &&
      message.heldForReview !== false &&
      !message.heldActions
    const copy = [...previous]
    copy[existingIndex] = {
      ...old,
      ...message,
      heldForReview: keepHeld
        ? true
        : message.heldForReview === false
          ? false
          : (message.heldForReview ?? old.heldForReview ?? false),
      heldHeader: keepHeld
        ? old.heldHeader
        : message.heldForReview
          ? message.heldHeader
          : message.heldForReview === false
            ? undefined
            : old.heldHeader,
      heldActions: keepHeld
        ? old.heldActions
        : message.heldForReview
          ? message.heldActions
          : message.heldForReview === false
            ? undefined
            : old.heldActions,
      authorName: message.authorName || old.authorName,
      isModerator: !!(message.isModerator || old.isModerator),
      isMember: !!(message.isMember || old.isMember),
      isOwner: !!(message.isOwner || old.isOwner),
      isVerified: !!(message.isVerified || old.isVerified)
    }
    return copy
  }

  if (
    message.pending ||
    (typeof message.id === 'string' && message.id.startsWith('local-'))
  ) return appendInFeedOrder(previous, message, paused)

  if (message.isSelf || message.authorName) {
    const echoIndex = previous.findIndex(
      (item) =>
        !!item.awaitingEcho &&
        item.text === message.text &&
        Date.now() - item.timestamp <= 45_000
    )
    if (echoIndex >= 0) {
      const copy = [...previous]
      const old = copy[echoIndex]!
      copy[echoIndex] = {
        ...old,
        ...message,
        id: message.id || old.id,
        isSelf: true,
        pending: false,
        failed: false,
        awaitingEcho: false,
        hasContextMenu: message.hasContextMenu ?? old.hasContextMenu,
        authorName: message.authorName || old.authorName,
        isModerator: !!(message.isModerator || old.isModerator),
        isMember: !!(message.isMember || old.isMember),
        isOwner: !!(message.isOwner || old.isOwner),
        isVerified: !!(message.isVerified || old.isVerified)
      }
      return copy
    }
  }

  return appendInFeedOrder(previous, message, paused)
}
