import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_APP_LOCALE } from '../../../shared/i18n/locale'
import { resources } from './resources'

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_APP_LOCALE,
  fallbackLng: DEFAULT_APP_LOCALE,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnEmptyString: false
})

export { i18n }
