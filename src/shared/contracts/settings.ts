import type { AppLocale } from '../i18n/locale'

export interface HighlightRule {
  id: string
  pattern: string
  color: string
  enabled: boolean
  caseSensitive?: boolean
  wholeWord?: boolean
  isRegex?: boolean
  playSound?: boolean
  soundPath?: string
}

export interface HighlightPreferences {
  selfEnabled: boolean
  selfColor: string
  selfPlaySound: boolean
  selfSoundPath?: string
  defaultSoundPath?: string
  playSoundWhileFocused: boolean
}

export type ChatActionKind = 'timeout' | 'delete' | 'hide' | 'unhide' | 'command'

export interface ChatActionButton {
  id: string
  label: string
  kind: ChatActionKind
  enabled: boolean
  timeoutKey?: string
  command?: string
  color?: string
}

export const TIMEOUT_DURATION_KEYS = ['10s', '1m', '5m', '10m', '30m', '24h'] as const
export type TimeoutDurationKey = (typeof TIMEOUT_DURATION_KEYS)[number]

export interface AppSettings {
  version: 3
  locale: AppLocale
  pauseChatOnHover: boolean
  showFocusModeShortcut: boolean
  highlights: HighlightRule[]
  highlightPreferences: HighlightPreferences
  actionButtons: ChatActionButton[]
}
