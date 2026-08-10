import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLocale } from '../../../../shared/i18n/locale'

export interface LanguageSettingsSectionProps {
  locale: AppLocale
  busy: boolean
  onChange(locale: AppLocale): void
}

export function LanguageSettingsSection({
  locale,
  busy,
  onChange
}: LanguageSettingsSectionProps): ReactElement {
  const { t } = useTranslation(['settings', 'common'])
  return (
    <div className="settings-row">
      <div className="sr-text">
        <div className="sr-title">{t('settings:language.title')}</div>
        <div className="sr-desc">{t('settings:language.help')}</div>
      </div>
      <div className="sr-control">
        <select
          className="act-select settings-language-select"
          value={locale}
          disabled={busy}
          onChange={(event) => onChange(event.target.value as AppLocale)}
        >
          <option value="en-US">{t('common:language.english')}</option>
          <option value="pt-BR">{t('common:language.portugueseBrazil')}</option>
        </select>
      </div>
    </div>
  )
}
