import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppSettings } from '../../../../shared/types'
import { PillToggle } from '../settings/ui/PillToggle'

export function RepeatCounterSettingsRow(): ReactElement {
  const { t } = useTranslation('settings')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const apply = (settings: AppSettings): void => setEnabled(settings.repeatCounter === true)
    void window.settingsPopup.get().then(apply).catch(console.error)
    return window.settingsPopup.onChanged(apply)
  }, [])

  async function save(next: boolean): Promise<void> {
    setBusy(true)
    try {
      const saved = await window.settingsPopup.setRepeatCounter(next)
      setEnabled(saved.repeatCounter === true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-row">
      <div className="sr-text">
        <div className="sr-title">{t('chat.repeatCounter')}</div>
        <div className="sr-desc">{t('chat.repeatCounterHelp')}</div>
      </div>
      <div className="sr-control">
        <PillToggle
          aria-label={t('chat.repeatCounter')}
          checked={enabled}
          disabled={busy}
          onChange={(next) => void save(next)}
        />
      </div>
    </div>
  )
}
