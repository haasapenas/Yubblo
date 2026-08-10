import type { ChatMessage, HighlightPreferences, HighlightRule, UserProfile } from '../../../../shared/types'

export const HIGHLIGHT_PRESETS = [
  '#f5a524', '#ff4e45', '#3dd68c', '#5b9dff',
  '#c4b5fd', '#ff6bcb', '#4ecdc4', '#ffe66d'
]

export interface SelfHighlightInput {
  aliases: string[]
  channelId?: string
  enabled: boolean
  color: string
}

export function buildSelfHighlightInput(
  profile: Pick<UserProfile, 'handle' | 'name' | 'channelId'> | null | undefined,
  preferences: Pick<HighlightPreferences, 'selfEnabled' | 'selfColor'>
): SelfHighlightInput {
  const aliases = [profile?.handle, profile?.name]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().replace(/^@/, ''))
    .filter((value, index, all) => value.length > 0 &&
      all.findIndex((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase()) === index)
  return {
    aliases,
    channelId: profile?.channelId,
    enabled: preferences.selfEnabled,
    color: preferences.selfColor
  }
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function messageSearchText(message: ChatMessage): string {
  if (message.parts?.length) {
    return message.parts.map((part) => part.text || '').join('')
  }
  return message.text || ''
}

const LEET_PATTERNS: Readonly<Record<string, string>> = {
  a: '[a4@]',
  e: '[e3\u20ac]',
  i: '[i1!|]',
  o: '[o0]',
  s: '[s5$]',
  t: '[t7+]',
  g: '[g9]',
  l: '[l1|]'
}

export function ruleMatchesText(text: string, rule: HighlightRule): boolean {
  const rawPattern = rule.pattern.trim()
  if (!rule.enabled || !rawPattern) return false
  const wildcard = rawPattern.endsWith('*')
  const keyword = wildcard ? rawPattern.slice(0, -1) : rawPattern
  if (!keyword) return false
  let pattern = ''
  for (const character of keyword.toLocaleLowerCase()) {
    pattern += LEET_PATTERNS[character] || escapeRegExp(character)
  }
  try {
    return new RegExp(wildcard ? pattern : `\\b${pattern}\\b`, 'iu').test(text)
  } catch {
    return false
  }
}
export function findHighlight(
  message: ChatMessage,
  rules: HighlightRule[],
  self?: SelfHighlightInput
): HighlightRule | null {
  if (message.removed) return null
  const text = messageSearchText(message)
  if (!text) return null

  if (self?.enabled) {
    for (const alias of self.aliases) {
      const normalized = alias.trim().replace(/^@/, '')
      if (!normalized) continue
      const selfRule: HighlightRule = {
        id: 'self',
        pattern: normalized,
        color: self.color,
        enabled: true,
        wholeWord: true
      }
      if (ruleMatchesText(text, selfRule)) return selfRule
    }
  }
  return rules.find((rule) => ruleMatchesText(text, rule)) || null
}

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '').trim()
  let red = 0
  let green = 0
  let blue = 0
  if (value.length === 3) {
    red = parseInt(value[0]! + value[0], 16)
    green = parseInt(value[1]! + value[1], 16)
    blue = parseInt(value[2]! + value[2], 16)
  } else if (value.length >= 6) {
    red = parseInt(value.slice(0, 2), 16)
    green = parseInt(value.slice(2, 4), 16)
    blue = parseInt(value.slice(4, 6), 16)
  }
  if ([red, green, blue].some(Number.isNaN)) {
    return `rgba(245, 165, 36, ${alpha})`
  }
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function newLocalHighlightId(): string {
  return `hl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function newLocalActionId(): string {
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
