import type { AppLocale } from './locale'

export interface YoutubeLocale {
  hl: 'en' | 'pt'
  gl: 'US' | 'BR'
  loginHl: AppLocale
  acceptLanguage: string
}

const YOUTUBE_LOCALES: Record<AppLocale, YoutubeLocale> = {
  'en-US': {
    hl: 'en',
    gl: 'US',
    loginHl: 'en-US',
    acceptLanguage: 'en-US,en;q=0.9'
  },
  'pt-BR': {
    hl: 'pt',
    gl: 'BR',
    loginHl: 'pt-BR',
    acceptLanguage: 'pt-BR,pt;q=0.9,en;q=0.8'
  }
}

export function getYoutubeLocale(locale: AppLocale): YoutubeLocale {
  return YOUTUBE_LOCALES[locale]
}
