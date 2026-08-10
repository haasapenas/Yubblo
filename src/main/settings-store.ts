/**
 * Configurações do app (highlights, botões de ação, etc.) — JSON em userData.
 */
import { app } from 'electron'
import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type {
  AppSettings,
  ChatActionButton,
  ChatActionKind,
  HighlightPreferences,
  HighlightRule
} from '../shared/types'
import { TIMEOUT_DURATION_KEYS } from '../shared/types'
import type { AppLocale } from '../shared/i18n/locale'
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from '../shared/i18n/locale'

const FILE_NAME = 'settings.json'
const DEFAULT_HIGHLIGHT_COLOR = '#f5a524'

const DEFAULT_COLORS = [
  '#f5a524',
  '#ff4e45',
  '#3dd68c',
  '#5b9dff',
  '#c4b5fd',
  '#ff6bcb',
  '#4ecdc4',
  '#ffe66d'
]

function dir(): string {
  const d = app.getPath('userData')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function filePath(): string {
  return join(dir(), FILE_NAME)
}

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`
}

/** Atalhos padrão para durações comuns de timeout. */
export function defaultActionButtons(): ChatActionButton[] {
  return [
    {
      id: newId('act'),
      label: '10s',
      kind: 'timeout',
      timeoutKey: '10s',
      enabled: true
    },
    {
      id: newId('act'),
      label: '5m',
      kind: 'timeout',
      timeoutKey: '5m',
      enabled: true
    },
    {
      id: newId('act'),
      label: '24h',
      kind: 'timeout',
      timeoutKey: '24h',
      enabled: true
    },
    {
      id: newId('act'),
      label: '✕',
      kind: 'delete',
      enabled: true
    }
  ]
}

function defaultHighlightPreferences(): HighlightPreferences {
  return {
    selfEnabled: true,
    selfColor: DEFAULT_HIGHLIGHT_COLOR,
    selfPlaySound: false,
    playSoundWhileFocused: false
  }
}

function normalizeOptionalPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function defaultSettings(): AppSettings {
  return {
    version: 3,
    locale: DEFAULT_APP_LOCALE,
    pauseChatOnHover: false,
    showFocusModeShortcut: false,
    highlights: [],
    highlightPreferences: defaultHighlightPreferences(),
    actionButtons: defaultActionButtons()
  }
}

function normalizeRule(raw: Partial<HighlightRule> | null | undefined): HighlightRule | null {
  if (!raw || typeof raw !== 'object') return null
  const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : ''
  if (!pattern) return null
  const color =
    typeof raw.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.color.trim())
      ? raw.color.trim()
      : DEFAULT_COLORS[0]!
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('hl'),
    pattern,
    color,
    enabled: raw.enabled !== false,
    caseSensitive: false,
    wholeWord: false,
    isRegex: false,
    playSound: !!raw.playSound,
    soundPath: normalizeOptionalPath(raw.soundPath)
  }
}

const KINDS: ChatActionKind[] = ['timeout', 'delete', 'hide', 'unhide', 'command']

function normalizeAction(
  raw: Partial<ChatActionButton> | null | undefined
): ChatActionButton | null {
  if (!raw || typeof raw !== 'object') return null
  const kind = (KINDS.includes(raw.kind as ChatActionKind)
    ? raw.kind
    : null) as ChatActionKind | null
  if (!kind) return null
  const label =
    typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.trim().slice(0, 24)
      : kind === 'timeout'
        ? raw.timeoutKey || '?'
        : kind === 'delete'
          ? '✕'
          : kind === 'hide'
            ? 'hide'
            : kind === 'unhide'
              ? 'show'
              : 'msg'
  const color =
    typeof raw.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.color.trim())
      ? raw.color.trim()
      : undefined

  if (kind === 'timeout') {
    const key = String(raw.timeoutKey || '')
      .trim()
      .toLowerCase()
    if (!(TIMEOUT_DURATION_KEYS as readonly string[]).includes(key)) return null
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : newId('act'),
      label,
      kind,
      enabled: raw.enabled !== false,
      timeoutKey: key,
      color
    }
  }

  if (kind === 'command') {
    const command = typeof raw.command === 'string' ? raw.command.trim() : ''
    if (!command) return null
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : newId('act'),
      label,
      kind,
      enabled: raw.enabled !== false,
      command,
      color
    }
  }

  // delete / hide
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('act'),
    label,
    kind,
    enabled: raw.enabled !== false,
    color
  }
}

const LEGACY_DEFAULT_ACTION_COLORS = [
  { kind: 'timeout', timeoutKey: '10s', color: '#f5a524' },
  { kind: 'timeout', timeoutKey: '5m', color: '#ff8a4c' },
  { kind: 'timeout', timeoutKey: '24h', color: '#ef5350' },
  { kind: 'delete', timeoutKey: undefined, color: '#ef5350' }
] as const

function migrateLegacyDefaultActionColors(
  buttons: ChatActionButton[]
): ChatActionButton[] {
  const isLegacyDefault = buttons.length === LEGACY_DEFAULT_ACTION_COLORS.length &&
    buttons.every((button, index) => {
      const legacy = LEGACY_DEFAULT_ACTION_COLORS[index]!
      return button.kind === legacy.kind &&
        button.timeoutKey === legacy.timeoutKey &&
        button.color?.toLowerCase() === legacy.color
    })
  if (!isLegacyDefault) return buttons
  return buttons.map(({ color: _color, ...button }) => button)
}

interface SettingsInput {
  version?: unknown
  locale?: unknown
  pauseChatOnHover?: unknown
  showFocusModeShortcut?: unknown
  highlights?: unknown
  highlightPreferences?: unknown
  actionButtons?: unknown
}

export function normalizeSettings(raw: SettingsInput = {}): AppSettings {
  if (raw.version !== 3) return defaultSettings()
  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights.map(normalizeRule).filter((rule): rule is HighlightRule => !!rule)
    : []
  const actionButtons = migrateLegacyDefaultActionColors(Array.isArray(raw.actionButtons)
    ? raw.actionButtons.map(normalizeAction).filter((button): button is ChatActionButton => !!button)
    : defaultActionButtons())
  const input = raw.highlightPreferences && typeof raw.highlightPreferences === 'object'
    ? raw.highlightPreferences as Partial<HighlightPreferences>
    : {}
  const selfColor = typeof input.selfColor === 'string' && /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(input.selfColor.trim())
    ? input.selfColor.trim()
    : DEFAULT_HIGHLIGHT_COLOR
  const highlightPreferences: HighlightPreferences = {
    selfEnabled: input.selfEnabled !== false,
    selfColor,
    selfPlaySound: input.selfPlaySound === true,
    selfSoundPath: normalizeOptionalPath(input.selfSoundPath),
    defaultSoundPath: normalizeOptionalPath(input.defaultSoundPath),
    playSoundWhileFocused: input.playSoundWhileFocused === true
  }
  return {
    version: 3,
    locale: normalizeAppLocale(raw.locale),
    pauseChatOnHover: raw.pauseChatOnHover === true,
    showFocusModeShortcut: raw.showFocusModeShortcut === true,
    highlights,
    highlightPreferences,
    actionButtons
  }
}

export function loadSettings(): AppSettings {
  const path = filePath()
  if (!existsSync(path)) return defaultSettings()
  try {
    return normalizeSettings(JSON.parse(readFileSync(path, 'utf8')) as SettingsInput)
  } catch (e) {
    console.warn('[settings-store] load failed', e)
    return defaultSettings()
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const highlights = (settings.highlights || [])
    .map(normalizeRule)
    .filter((r): r is HighlightRule => !!r)
  const actionButtons = (settings.actionButtons || [])
    .map(normalizeAction)
    .filter((r): r is ChatActionButton => !!r)
  const normalized = normalizeSettings({ ...settings, highlights, actionButtons })
  try {
    writeFileSync(filePath(), JSON.stringify(normalized, null, 2), 'utf8')
  } catch (e) {
    console.warn('[settings-store] save failed', e)
  }
  return normalized
}

export function setHighlights(rules: HighlightRule[]): AppSettings {
  const current = loadSettings()
  return saveSettings({ ...current, highlights: rules })
}

export function setHighlightPreferences(preferences: HighlightPreferences): AppSettings {
  const current = loadSettings()
  return saveSettings({ ...current, highlightPreferences: preferences })
}

export function setActionButtons(buttons: ChatActionButton[]): AppSettings {
  const current = loadSettings()
  return saveSettings({ ...current, actionButtons: buttons })
}

export function setLocale(locale: AppLocale): AppSettings {
  const current = loadSettings()
  return saveSettings({ ...current, locale: normalizeAppLocale(locale) })
}

export function setPauseChatOnHover(enabled: boolean): AppSettings {
  const current = loadSettings()
  return saveSettings({ ...current, pauseChatOnHover: enabled === true })
}

export function setShowFocusModeShortcut(enabled: boolean): AppSettings {
  const current = loadSettings()
  return saveSettings({ ...current, showFocusModeShortcut: enabled === true })
}

export function createHighlightId(): string {
  return newId('hl')
}

export function createActionId(): string {
  return newId('act')
}

export { DEFAULT_COLORS as HIGHLIGHT_PRESET_COLORS }
