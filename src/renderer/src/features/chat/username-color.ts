import type { ChatMessage } from '../../../../shared/types'

export const USERNAME_COLORS = [
  '#FF6B6B',
  '#FF8A5B',
  '#FFA94D',
  '#FFD43B',
  '#C0EB75',
  '#69DB7C',
  '#38D9A9',
  '#3BC9DB',
  '#4DABF7',
  '#748FFC',
  '#9775FA',
  '#DA77F2',
  '#F783AC',
  '#FF8787',
  '#E599F7',
  '#91A7FF',
  '#66D9E8',
  '#8CE99A',
  '#FCC419',
  '#FF922B',
  '#20C997',
  '#845EF7',
  '#F06595',
  '#74C0FC'
] as const

function normalizeKey(value: string): string {
  return value.trim().replace(/^@+/, '').toLocaleLowerCase('en-US')
}

function hashKey(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function automaticUsernameColor(
  message: ChatMessage,
  enabled: boolean
): string | undefined {
  if (!enabled) return undefined
  if (message.isOwner || message.isModerator || message.isMember || message.isSelf) {
    return undefined
  }
  const key = normalizeKey(message.authorChannelId || message.authorName || '')
  if (!key) return undefined
  return USERNAME_COLORS[hashKey(key) % USERNAME_COLORS.length]
}
