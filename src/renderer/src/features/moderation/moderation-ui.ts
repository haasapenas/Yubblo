import type { ChatMessage, ModMenuAction, ModMenuResult } from '../../../../shared/types'
import { i18n } from '../../i18n/i18n-renderer'

export function canUseMessageMenu(result: ModMenuResult, message: ChatMessage): boolean {
  const actions = topLevelActions(result)
  const ownDelete = !!message.isSelf && actions.length > 0 && actions.every((action) => action.kind === 'delete')
  return !!result.channelActivityAvailable || (actions.length > 0 && (result.canModerate || ownDelete))
}

export function parseSystemModText(
  text: string,
  targetName?: string
): { target: string; rest: string } {
  const trimmed = text.trim()
  if (targetName) {
    const target = targetName.startsWith('@') ? targetName : `@${targetName}`
    if (trimmed.startsWith(target + ' ')) {
      return { target, rest: trimmed.slice(target.length + 1) }
    }
    if (trimmed.startsWith(target)) {
      return { target, rest: trimmed.slice(target.length).trimStart() }
    }
  }
  const match = trimmed.match(/^(@\S+)\s+(.+)$/)
  return match
    ? { target: match[1]!, rest: match[2]! }
    : { target: '', rest: trimmed }
}

export function durationKeyFromLabel(label: string): string | null {
  const value = label.trim().toLowerCase()
  if (!value || !/\d/.test(value)) return null
  const number = parseInt(value.match(/\d+/)?.[0] || '', 10)
  if (!Number.isFinite(number)) return null
  if (/\b(s|sec|second|segundo)/i.test(value)) return `${number}s`
  if (/\b(m|min|minute|minuto)/i.test(value)) return `${number}m`
  if (/\b(h|hr|hour|hora)/i.test(value)) return `${number}h`
  if (/\b(d|day|dia)/i.test(value)) return `${number}d`
  return null
}

export function matchTimeoutIconType(
  durations: ModMenuAction[],
  key: string
): string | null {
  const wanted = key.toLowerCase()
  for (const duration of durations) {
    if (
      duration.iconType === `TIMEOUT_${wanted}` ||
      duration.iconType.endsWith(`_${wanted}`) ||
      durationKeyFromLabel(duration.label) === wanted
    ) return duration.iconType
  }
  return null
}

export function expandCommandTemplate(
  template: string,
  context: {
    authorName: string
    channelHandle?: string
    channelName?: string
    messageText: string
  }
): string {
  const bare = context.authorName.replace(/^@/, '').trim()
  const mention = bare ? `@${bare}` : ''
  const channel = (context.channelHandle || context.channelName || '')
    .replace(/^@/, '')
    .trim()
  return template
    .replace(/\{@user\}/gi, mention)
    .replace(/\{username\}/gi, mention)
    .replace(/\{user\}/gi, mention)
    .replace(/\{user\.name\}/gi, bare)
    .replace(/\{name\}/gi, bare)
    .replace(/\{channel\}/gi, channel)
    .replace(/\{channel\.name\}/gi, channel)
    .replace(/\{message\}/gi, context.messageText)
    .replace(/\{msg\}/gi, context.messageText)
}

export function isTimeDurationLabel(label: string): boolean {
  const value = label.trim().toLowerCase()
  if (
    value.includes('chat do canal') || value.includes('channel chat') ||
    value.includes('super chat') || value.includes('top chat') ||
    value.includes('live chat') || value.includes('chat ao vivo') ||
    value.includes('principais')
  ) return false
  return /\b\d+\s*(s|sec|secs|second|seconds|segundo|segundos|m|min|mins|minute|minutes|minuto|minutos|h|hr|hrs|hour|hours|hora|horas)\b/i.test(value)
}

export function topLevelActions(result: ModMenuResult): ModMenuAction[] {
  const output: ModMenuAction[] = []
  let hasTimeout = false
  for (const action of result.actions) {
    if (action.kind === 'timeout') {
      if (action.iconType.startsWith('TIMEOUT_') && action.iconType !== 'TIMEOUT_MENU') continue
      if (hasTimeout) continue
      hasTimeout = true
      output.push({ iconType: action.iconType, label: 'timeout', kind: 'timeout' })
    } else if (action.kind === 'delete') {
      output.push({ ...action, label: 'delete' })
    } else if (action.kind === 'hide') {
      output.push({ ...action, label: 'hide' })
    } else if (action.kind === 'unhide') {
      output.push({ ...action, label: 'unhide' })
    }
  }
  if (!hasTimeout && result.timeoutDurations?.length) {
    output.push({ iconType: 'TIMEOUT_MENU', label: 'timeout', kind: 'timeout' })
  }
  const order: Record<string, number> = { delete: 0, timeout: 1, hide: 2, unhide: 3, other: 4 }
  return output.sort((left, right) => (order[left.kind] ?? 9) - (order[right.kind] ?? 9))
}

export function placeMenuFromPoint(
  x: number,
  y: number,
  viewport: { width: number; height: number },
  estimatedHeight = 200
): { x: number; y: number } {
  const menuWidth = 220
  const padding = 8
  return {
    x: Math.max(padding, Math.min(x, viewport.width - menuWidth - padding)),
    y: Math.max(padding, Math.min(y, viewport.height - estimatedHeight - padding))
  }
}

export function modLabel(action: ModMenuAction): string {
  if (action.kind === 'delete') return i18n.t('actions.delete', { ns: 'moderation' })
  if (action.kind === 'hide') return i18n.t('actions.hide', { ns: 'moderation' })
  if (action.kind === 'unhide') return i18n.t('actions.unhide', { ns: 'moderation' })
  if (action.kind === 'timeout') {
    if (action.iconType === 'TIMEOUT_MENU') {
      return i18n.t('actions.timeout', { ns: 'moderation' })
    }
    return (
      durationKeyFromLabel(action.label) ||
      action.iconType.match(/TIMEOUT_(\d+)([SMHD])$/i)?.slice(1).join('').toLowerCase() ||
      i18n.t('actions.timeout', { ns: 'moderation' })
    )
  }
  return action.label
}
