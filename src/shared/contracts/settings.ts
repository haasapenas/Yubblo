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

export const DEFAULT_HIGHLIGHT_RULE_COLOR = '#f5a52480'

export interface HighlightPreferences {
  selfEnabled: boolean
  selfColor: string
  selfPlaySound: boolean
  selfSoundPath?: string
  defaultSoundPath?: string
  playSoundWhileFocused: boolean
  defaultColor: string
}

export interface MonitoredUser {
  channelId?: string
  name: string
  color?: string
}

export interface MonitoringSettings {
  users: MonitoredUser[]
  color: string
}

export interface ChatLogsSettings {
  enabled: boolean
  onlyListedChannels: boolean
  channels: string[]
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
  chatFontSize: number
  chatMessagePadding: number
  separateMessages: boolean
  chatThreads: boolean
  repeatCounter: boolean
  alwaysOnTop: boolean
  alwaysOnTopButton: boolean
  pauseChatOnHover: boolean
  showFocusModeShortcut: boolean
  colorizeUsernames: boolean
  highlights: HighlightRule[]
  highlightPreferences: HighlightPreferences
  monitoring: MonitoringSettings
  chatLogs: ChatLogsSettings
  actionButtons: ChatActionButton[]
}
