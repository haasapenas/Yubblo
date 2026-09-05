import type { ChatActionButton } from '../../shared/contracts/settings'
import type { ChatSearchEntry, ChatSearchWindowState } from '../../shared/contracts/chat-search'

const SEARCH_ACTION_KINDS = new Set(['timeout', 'delete', 'hide'])

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function sanitizeActionButton(value: unknown): ChatActionButton | null {
  if (!value || typeof value !== 'object') return null
  const button = value as Partial<ChatActionButton>
  if (!button.enabled) return null
  if (!button.kind || !SEARCH_ACTION_KINDS.has(button.kind)) return null
  if (button.kind === 'timeout' && !String(button.timeoutKey || '').trim()) return null
  const id = String(button.id || '').trim()
  if (!id) return null
  return {
    id,
    label: String(button.label || ''),
    kind: button.kind,
    enabled: true,
    ...(button.timeoutKey ? { timeoutKey: String(button.timeoutKey) } : {}),
    ...(button.color ? { color: String(button.color) } : {})
  }
}

function sanitizeEntry(value: unknown): ChatSearchEntry {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<ChatSearchEntry>
  return {
    id: String(entry.id || ''),
    authorName: String(entry.authorName || ''),
    authorChannelId: optionalString(entry.authorChannelId),
    text: String(entry.text || ''),
    timestamp: Number(entry.timestamp) || Date.now(),
    isModerator: !!entry.isModerator,
    isMember: !!entry.isMember,
    isOwner: !!entry.isOwner,
    isSelf: !!entry.isSelf,
    systemKind: optionalString(entry.systemKind),
    systemTargetChannelId: optionalString(entry.systemTargetChannelId),
    systemTargetName: optionalString(entry.systemTargetName),
    systemSourceMessageId: optionalString(entry.systemSourceMessageId),
    hasContextMenu: !!entry.hasContextMenu,
    heldForReview: !!entry.heldForReview,
    pending: !!entry.pending,
    removed: !!entry.removed
  }
}

export function sanitizeChatSearchWindowState(state: {
  channelLabel?: unknown
  videoId?: unknown
  canModerate?: unknown
  actionButtons?: unknown
  messages?: unknown
}): ChatSearchWindowState {
  const actionButtons = Array.isArray(state.actionButtons)
    ? state.actionButtons.map(sanitizeActionButton).filter((button): button is ChatActionButton => !!button)
    : []
  const messages = Array.isArray(state.messages) ? state.messages.map(sanitizeEntry) : []
  return {
    channelLabel: String(state.channelLabel || 'chat'),
    videoId: typeof state.videoId === 'string' ? state.videoId : null,
    canModerate: !!state.canModerate,
    actionButtons,
    messages
  }
}
