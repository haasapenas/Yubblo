import { normalizeAppLocale } from './locale'

export function formatIsoDateForLocale(value: string, locale: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value

  const [, year, month, day] = match
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`)

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return value
  }

  return normalizeAppLocale(locale) === 'pt-BR'
    ? `${day}/${month}/${year}`
    : `${month}/${day}/${year}`
}
