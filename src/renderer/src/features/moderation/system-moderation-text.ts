import type { ChatMessage } from '../../../../shared/types'
import { i18n } from '../../i18n/i18n-renderer'

function atName(value: string | undefined, fallback: string): string {
  const name = value?.trim()
  if (!name) return fallback
  return name.startsWith('@') ? name : `@${name}`
}

function durationText(key: string | undefined): string {
  const match = key?.match(/^(\d+)([smhd])$/i)
  if (!match) return ''
  const count = Number(match[1])
  const unit = ({ s: 'second', m: 'minute', h: 'hour', d: 'day' } as const)[
    match[2]!.toLowerCase() as 's' | 'm' | 'h' | 'd'
  ]
  return i18n.t(`chat:systemModeration.duration.${unit}`, { count })
}

export function formatSystemModerationText(message: ChatMessage): string {
  const target = atName(
    message.systemTargetName,
    i18n.t('chat:systemModeration.unknownTarget')
  )
  const moderator = atName(
    message.systemModeratorName,
    i18n.t('chat:systemModeration.unknownModerator')
  )
  const values = { target, moderator }

  if (message.systemKind === 'mod-delete') {
    return i18n.t('chat:systemModeration.deleted', values)
  }
  if (message.systemKind === 'mod-timeout' && message.systemDurationKey) {
    return i18n.t('chat:systemModeration.timeout', {
      ...values,
      duration: durationText(message.systemDurationKey)
    })
  }
  if (message.systemKind === 'mod-hide') {
    return i18n.t('chat:systemModeration.hidden', values)
  }
  if (message.systemKind === 'mod-unhide') {
    return i18n.t('chat:systemModeration.unhidden', values)
  }
  return message.text
}
