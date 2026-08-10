/**
 * Normalização dos três tipos de ação e campos persistidos.
 */
import type {
  ModerationLogAction,
  ModerationLogEntry
} from '../../shared/contracts/moderation-logs'
import { formatLocalDate, formatLocalTime } from './moderation-log-paths'

const ACTIONS: ReadonlySet<string> = new Set(['timeout', 'deleted', 'hide'])

export function isModerationLogAction(value: unknown): value is ModerationLogAction {
  return typeof value === 'string' && ACTIONS.has(value)
}

export function normalizeDisplayName(raw: string | undefined | null): string {
  const n = String(raw || '').trim()
  if (!n) return ''
  return n.startsWith('@') ? n : n
}

export function splitLocalDateTime(at: Date | number = Date.now()): {
  date: string
  time: string
} {
  const d = typeof at === 'number' ? new Date(at) : at
  return {
    date: formatLocalDate(d),
    time: formatLocalTime(d)
  }
}

export interface NormalizeLogInput {
  action: ModerationLogAction
  moderator?: string | null
  user?: string | null
  message?: string | null
  at?: Date | number
}

/** Monta entrada estável pronta para JSONL. */
export function normalizeLogEntry(input: NormalizeLogInput): ModerationLogEntry {
  const { date, time } = splitLocalDateTime(input.at ?? Date.now())
  return {
    date,
    time,
    moderator: normalizeDisplayName(input.moderator),
    user: normalizeDisplayName(input.user),
    action: input.action,
    message: String(input.message || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .slice(0, 2000)
  }
}

/** Valida linha lida do disco; null se inválida. */
export function parseLogEntryLine(line: string): ModerationLogEntry | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const raw = JSON.parse(trimmed) as Partial<ModerationLogEntry>
    if (!isModerationLogAction(raw.action)) return null
    if (typeof raw.date !== 'string' || typeof raw.time !== 'string') return null
    return {
      date: raw.date,
      time: raw.time,
      moderator: typeof raw.moderator === 'string' ? raw.moderator : '',
      user: typeof raw.user === 'string' ? raw.user : '',
      action: raw.action,
      message: typeof raw.message === 'string' ? raw.message : ''
    }
  } catch {
    return null
  }
}
