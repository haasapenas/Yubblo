import { normalizeAppLocale } from '../../../../shared/i18n/locale'
import { i18n } from '../../i18n/i18n-renderer'

export type JoinedUnit = 'year' | 'month' | 'week' | 'day'

const JOINED_UNITS: Array<{ unit: JoinedUnit; pattern: RegExp }> = [
  { unit: 'year', pattern: /(\d+)\s*(years?|anos?)\b/i },
  { unit: 'month', pattern: /(\d+)\s*(months?|meses|m[eê]s)\b/i },
  { unit: 'week', pattern: /(\d+)\s*(weeks?|semanas?)\b/i },
  { unit: 'day', pattern: /(\d+)\s*(days?|dias?)\b/i }
]

const SUBSCRIBER_SUFFIXES: Record<string, number> = {
  k: 1e3,
  mil: 1e3,
  m: 1e6,
  mi: 1e6,
  milhao: 1e6,
  milhoes: 1e6,
  b: 1e9,
  bi: 1e9,
  bilhao: 1e9,
  bilhoes: 1e9
}

export function parseJoinedText(text: string): { count: number; unit: JoinedUnit } | null {
  for (const candidate of JOINED_UNITS) {
    const match = text.match(candidate.pattern)
    if (!match) continue
    const count = Number(match[1])
    if (!Number.isFinite(count) || count < 1) continue
    return { count, unit: candidate.unit }
  }
  return null
}

function parseDecimal(value: string): number | null {
  const raw = value.trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return Number(raw)
  if (/^\d{1,3}[.,]\d{1,2}$/.test(raw)) return Number(raw.replace(',', '.'))
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) return Number(raw.replace(/[.,]/g, ''))
  return null
}

function foldSuffix(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function parseSubscriberCount(text: string): number | null {
  const folded = foldSuffix(text.trim().toLowerCase())
  if (/^(nenhum(\s+inscritos?)?|no(\s+subscribers?)?)$/i.test(folded)) return 0
  const raw = text
    .trim()
    .toLowerCase()
    .replace(/subscribers?|inscritos?/gi, ' ')
    .replace(/\bde\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return null
  const match = raw.match(/^([\d.,]+)\s*([a-zãõé]+)?$/i)
  if (!match) return null
  const count = parseDecimal(match[1] || '')
  if (count == null || !Number.isFinite(count) || count < 0) return null
  const suffix = foldSuffix(match[2] || '')
  const multiplier = suffix ? SUBSCRIBER_SUFFIXES[suffix] : 1
  if (suffix && !multiplier) return null
  return Math.round(count * (multiplier || 1))
}

export function formatCompactCount(count: number, locale: string): string {
  return new Intl.NumberFormat(normalizeAppLocale(locale), {
    notation: count >= 1000 ? 'compact' : 'standard',
    compactDisplay: 'short',
    maximumFractionDigits: 1
  }).format(count)
}

export function formatProfileJoined(text: string | undefined): string | undefined {
  if (!text) return undefined
  const parsed = parseJoinedText(text)
  if (!parsed) return text
  return i18n.t(`joinedYouTube.${parsed.unit}`, { ns: 'channelActivity', count: parsed.count })
}

export function formatProfileSubscribers(text: string | undefined): string | undefined {
  if (!text) return undefined
  const count = parseSubscriberCount(text)
  if (count == null) return text
  if (count === 0) return i18n.t('subscribers_zero', { ns: 'channelActivity' })
  return i18n.t('subscribers', {
    ns: 'channelActivity',
    count,
    formatted: formatCompactCount(count, i18n.language)
  })
}
