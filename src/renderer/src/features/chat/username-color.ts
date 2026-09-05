import type { ChatMessage } from '../../../../shared/types'

export const USERNAME_COLORS = [
  '#EC3C3C',
  '#E76D5F',
  '#F7896E',
  '#D9623A',
  '#EC8D65',
  '#EC823C',
  '#E7E75F',
  '#EAF76E',
  '#BAD93A',
  '#CAEC65',
  '#B7EC3C',
  '#B1E75F',
  '#B3F76E',
  '#7AD93A',
  '#65ECB6',
  '#3CECB7',
  '#5FE7C5',
  '#6EF7DC',
  '#3AD9CA',
  '#65ECEC',
  '#3CDAEC',
  '#5FCCE7',
  '#DC6EF7',
  '#CA3AD9',
  '#EC65EC',
  '#EC3CDA',
  '#E75FCC',
  '#F76ECE',
  '#D93A9A',
  '#EC65A8',
  '#EC3C82',
  '#E75F7A'
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
  return Math.imul(hash >>> 0, 2654435761) >>> 0
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
