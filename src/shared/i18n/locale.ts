export const APP_LOCALES = ['en-US', 'pt-BR'] as const

export type AppLocale = (typeof APP_LOCALES)[number]

export const DEFAULT_APP_LOCALE: AppLocale = 'en-US'

export function normalizeAppLocale(value: unknown): AppLocale {
  return APP_LOCALES.includes(value as AppLocale)
    ? value as AppLocale
    : DEFAULT_APP_LOCALE
}
