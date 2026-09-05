import type { ChannelActivityModerationAction, ChannelActivityTarget } from '../../shared/types'
import type { ChannelSession } from '../chat/chat-session'
export function compactTimeoutLabel(label: string): string {
  const normalized = label.trim().toLocaleLowerCase()
  const compact = normalized.match(/^(\d+(?:[.,]\d+)?)\s*([smhd])$/)
  if (compact) return `${compact[1]}${compact[2]}`
  const amount = normalized.match(/\d+(?:[.,]\d+)?/)?.[0]
  if (!amount) return label
  if (/\b(segundo|segundos|second|seconds|sec|secs)\b/.test(normalized)) return `${amount}s`
  if (/\b(minuto|minutos|minute|minutes|min|mins)\b/.test(normalized)) return `${amount}m`
  if (/\b(hora|horas|hour|hours|hr|hrs)\b/.test(normalized)) return `${amount}h`
  if (/\b(dia|dias|day|days)\b/.test(normalized)) return `${amount}d`
  return label
}

function cachedMessageIdForTarget(
  session: ChannelSession,
  target: ChannelActivityTarget
): string | undefined {
  const matchesAuthor = (messageId: string): boolean => {
    const item = session.itemStore.get(messageId)
    return !item?.authorChannelId || item.authorChannelId === target.authorChannelId
  }
  const hasMenu = (messageId: string): boolean => {
    const menu = session.modMenuCache.get(messageId)
    return Boolean(menu?.canModerate && session.modEndpointCache.get(messageId))
  }
  if (hasMenu(target.messageId) && matchesAuthor(target.messageId)) {
    return target.messageId
  }
  for (const [messageId, item] of session.itemStore) {
    if (item.authorChannelId !== target.authorChannelId) continue
    if (!hasMenu(messageId)) continue
    return messageId
  }
  return undefined
}

export function resolveCachedChannelActivityMessageId(
  session: ChannelSession,
  target: ChannelActivityTarget
): string | undefined {
  return cachedMessageIdForTarget(session, target)
}

export function readCachedChannelActivityActions(
  session: ChannelSession,
  target: ChannelActivityTarget
): ChannelActivityModerationAction[] {
  const messageId = cachedMessageIdForTarget(session, target)
  if (!messageId) return []
  const menu = session.modMenuCache.get(messageId)
  const endpoints = session.modEndpointCache.get(messageId)
  if (!menu?.canModerate || !endpoints) return []

  const seen = new Set<string>()
  const actions: ChannelActivityModerationAction[] = []
  for (const action of menu.timeoutDurations || []) {
    if (action.kind !== 'timeout' || seen.has(action.iconType) || !endpoints.has(action.iconType)) continue
    seen.add(action.iconType)
    actions.push({ id: action.iconType, iconType: action.iconType, kind: 'timeout', label: compactTimeoutLabel(action.label) })
  }
  const ban = menu.actions.find((action) =>
    action.kind === 'hide' && !seen.has(action.iconType) && endpoints.has(action.iconType)
  )
  if (ban) actions.push({ id: ban.iconType, iconType: ban.iconType, kind: 'hide', label: 'Ban' })
  return actions
}

export function requireCachedChannelActivityAction(
  session: ChannelSession,
  target: ChannelActivityTarget,
  iconType: string
): ChannelActivityModerationAction {
  const action = readCachedChannelActivityActions(session, target).find((candidate) => candidate.iconType === iconType)
  if (!action) throw new Error('Moderation action is no longer available.')
  return action
}