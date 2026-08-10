import type { HighlightPreferences, HighlightRule } from '../../../../../shared/types'
import { newLocalHighlightId } from '../highlights'
import type { HighlightDraft } from './use-highlight-autosave'

export interface HighlightImportResult {
  rules: HighlightRule[]
  preferencePatch?: Partial<HighlightPreferences>
}

const MAX_TRANSFER_BYTES = 1024 * 1024
const MAX_TRANSFER_RULES = 5000
const DEFAULT_EXTENSION_COLOR = '#ff0000'

interface ExtensionHighlightItem {
  word: string
  sound: boolean
  color: string
}

function validColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim())
    ? value.trim()
    : DEFAULT_EXTENSION_COLOR
}

function toRule(item: unknown, makeId: () => string): HighlightRule | null {
  if (!item || typeof item !== 'object') return null
  const source = item as Partial<ExtensionHighlightItem>
  const pattern = typeof source.word === 'string' ? source.word.trim() : ''
  if (!pattern) return null
  return {
    id: makeId(),
    pattern,
    color: validColor(source.color),
    enabled: true,
    caseSensitive: false,
    wholeWord: false,
    isRegex: false,
    playSound: source.sound === true
  }
}

function externalArgbColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const color = value.trim()
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    const alpha = color.slice(1, 3)
    const rgb = color.slice(3)
    return `#${rgb}${alpha}`.toLowerCase()
  }
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : null
}

function toExternalSettingsRule(item: unknown, makeId: () => string): HighlightRule | null {
  if (!item || typeof item !== 'object') return null
  const source = item as Record<string, unknown>
  if (source.regex === true) return null
  const pattern = typeof source.pattern === 'string' ? source.pattern.trim() : ''
  if (!pattern) return null
  return {
    id: makeId(),
    pattern,
    color: externalArgbColor(source.color) ?? DEFAULT_EXTENSION_COLOR,
    enabled: true,
    caseSensitive: false,
    wholeWord: false,
    isRegex: false,
    playSound: source.sound === true
  }
}

function externalPreferencePatch(value: unknown): Partial<HighlightPreferences> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const highlighting = value as Record<string, unknown>
  const patch: Partial<HighlightPreferences> = {}
  let imported = false
  const color = externalArgbColor(highlighting.selfHighlightColor)
  if (color) {
    patch.selfColor = color
    imported = true
  }
  const self = highlighting.selfHighlight
  if (self && typeof self === 'object') {
    const enableSound = (self as Record<string, unknown>).enableSound
    if (typeof enableSound === 'boolean') {
      patch.selfPlaySound = enableSound
      imported = true
    }
  }
  if (!imported) return undefined
  patch.selfEnabled = true
  return patch
}

export function parseHighlightImport(
  content: string,
  makeId: () => string = newLocalHighlightId
): HighlightImportResult {
  if (new TextEncoder().encode(content).byteLength > MAX_TRANSFER_BYTES) {
    throw new Error('FILE_TOO_LARGE')
  }
  let items: unknown[] = []
  let mapper = toRule
  let preferencePatch: Partial<HighlightPreferences> | undefined
  try {
    const parsed: unknown = JSON.parse(content)
    if (Array.isArray(parsed)) {
      items = parsed
    } else if (parsed && typeof parsed === 'object') {
      const highlighting = (parsed as Record<string, unknown>).highlighting
      if (highlighting && typeof highlighting === 'object') {
        const highlights = (highlighting as Record<string, unknown>).highlights
        if (Array.isArray(highlights)) {
          items = highlights
          mapper = toExternalSettingsRule
          preferencePatch = externalPreferencePatch(highlighting)
        }
      }
    }
  } catch {
    items = content.split(/\r?\n/).map((word) => ({ word, sound: false, color: DEFAULT_EXTENSION_COLOR }))
  }
  const rules: HighlightRule[] = []
  for (const item of items) {
    const rule = mapper(item, makeId)
    if (rule) rules.push(rule)
    if (rules.length >= MAX_TRANSFER_RULES) break
  }
  return { rules, preferencePatch }
}

export function parseExtensionHighlights(
  content: string,
  makeId: () => string = newLocalHighlightId
): HighlightRule[] {
  return parseHighlightImport(content, makeId).rules
}

export function mergeImportedHighlights(
  current: HighlightRule[],
  imported: HighlightRule[]
): HighlightRule[] {
  const merged = new Map(current.map((rule) => [rule.pattern.toLocaleLowerCase(), rule]))
  for (const rule of imported) {
    const key = rule.pattern.toLocaleLowerCase()
    const existing = merged.get(key)
    merged.set(key, existing ? { ...rule, id: existing.id } : rule)
  }
  return [...merged.values()]
}

export function mergeHighlightImport(
  current: HighlightDraft,
  imported: HighlightImportResult
): HighlightDraft {
  return {
    highlights: mergeImportedHighlights(current.highlights, imported.rules),
    highlightPreferences: {
      ...current.highlightPreferences,
      ...(imported.preferencePatch ?? {})
    }
  }
}

export function exportExtensionHighlightJson(rules: HighlightRule[]): string {
  const items: ExtensionHighlightItem[] = rules.map((rule) => ({
    word: rule.pattern,
    sound: rule.playSound === true,
    color: validColor(rule.color)
  }))
  return JSON.stringify(items, null, 2)
}
