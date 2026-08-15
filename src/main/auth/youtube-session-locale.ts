export interface YoutubeSessionLocaleInput {
  preferredLanguages: string[]
  systemLocale: string
  countryCode: string
  timezone: string
}

export interface YoutubeSessionLocaleSource {
  getPreferredSystemLanguages(): string[]
  getSystemLocale(): string
  getLocaleCountryCode(): string
}

export interface YoutubeSessionLocaleOptions {
  lang: string
  location: string
  timezone: string
}

function normalizeLanguage(value: string): string {
  const candidate = value.trim().replace(/_/g, '-') || 'en-US'
  try {
    return new Intl.Locale(candidate).toString()
  } catch {
    return 'en-US'
  }
}

export function resolveYoutubeSessionLocale(
  input: YoutubeSessionLocaleInput
): YoutubeSessionLocaleOptions {
  const lang = normalizeLanguage(
    input.preferredLanguages.find((value) => value.trim()) || input.systemLocale
  )
  let location = input.countryCode.trim().toUpperCase()

  if (!/^[A-Z]{2}$/.test(location)) {
    try {
      location = new Intl.Locale(lang).region || ''
    } catch {
      location = ''
    }
  }

  if (!/^[A-Z]{2}$/.test(location)) location = 'US'

  return {
    lang,
    location,
    timezone: input.timezone.trim() || 'UTC'
  }
}

export function getYoutubeSessionLocale(
  source: YoutubeSessionLocaleSource
): YoutubeSessionLocaleOptions {
  const preferredLanguages = source.getPreferredSystemLanguages()
  const systemLocale = source.getSystemLocale()
  const countryCode = source.getLocaleCountryCode()
  const options = resolveYoutubeSessionLocale({
    preferredLanguages,
    systemLocale,
    countryCode,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    console.log('[youtube-session] locale', {
      ...options,
      preferredLanguages,
      systemLocale
    })
  }

  return options
}
