import { TIMEOUT_DURATION_KEYS, type TimeoutDurationKey } from './contracts/settings'

const STANDARD_SECONDS: Array<readonly [number, TimeoutDurationKey]> = [
  [10, '10s'],
  [60, '1m'],
  [300, '5m'],
  [600, '10m'],
  [1800, '30m'],
  [86_400, '24h']
]

const SUFFIX: Record<string, number> = {
  k: 1e3,
  mil: 1e3,
  thousand: 1e3
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function parseCompactNumber(raw: string): number | null {
  const value = raw.trim()
  if (/^\d+$/.test(value)) return Number(value)
  if (/^\d{1,3}[.,]\d{1,2}$/.test(value)) return Number(value.replace(',', '.'))
  return null
}

export function parseTimeoutDurationSeconds(text: string): number | undefined {
  const normalized = fold(text).replace(/\s+/g, ' ').trim()
  const match = normalized.match(
    /([\d.,]+)\s*(mil|k|thousand)?\s*(segundos?|seconds?|secs?|minutos?|minutes?|mins?|horas?|hours?|hrs?|dias?|days?)\b/
  )
  if (!match) return undefined
  const amount = parseCompactNumber(match[1] || '')
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return undefined
  const suffix = fold(match[2] || '')
  const multiplier = suffix ? SUFFIX[suffix] : 1
  if (suffix && !multiplier) return undefined
  const count = amount * (multiplier || 1)
  const unit = match[3] || ''
  if (unit.startsWith('seg') || unit.startsWith('sec')) return Math.round(count)
  if (unit.startsWith('min')) return Math.round(count * 60)
  if (unit.startsWith('dia') || unit.startsWith('day')) return Math.round(count * 86_400)
  if (unit.startsWith('h') || unit.startsWith('hor')) return Math.round(count * 3600)
  return undefined
}

export function timeoutDurationKeyFromSeconds(seconds: number): TimeoutDurationKey | `${number}s` {
  let best: { key: TimeoutDurationKey; delta: number } | undefined
  for (const [canonical, key] of STANDARD_SECONDS) {
    const delta = Math.abs(seconds - canonical)
    if (!best || delta < best.delta) best = { key, delta }
  }
  if (best && (best.delta <= 120 || best.delta / Math.max(seconds, 1) <= 0.05)) {
    return best.key
  }
  if (seconds % 3600 === 0) return `${seconds / 3600}h` as TimeoutDurationKey
  if (seconds % 60 === 0) return `${seconds / 60}m` as TimeoutDurationKey
  return `${Math.round(seconds)}s`
}

export function timeoutDurationKeyFromText(text: string): string | undefined {
  const seconds = parseTimeoutDurationSeconds(text)
  if (seconds == null) return undefined
  return timeoutDurationKeyFromSeconds(seconds)
}

export function canonicalTimeoutDurationKey(key: string | undefined): string | undefined {
  if (!key?.trim()) return undefined
  const trimmed = key.trim().toLowerCase()
  if ((TIMEOUT_DURATION_KEYS as readonly string[]).includes(trimmed)) return trimmed
  const fromText = timeoutDurationKeyFromText(trimmed)
  if (fromText) return fromText
  const compact = trimmed.match(/^(\d+)([smhd])$/)
  if (!compact) return undefined
  if (compact[2] !== 's') return trimmed
  return timeoutDurationKeyFromSeconds(Number(compact[1]))
}
