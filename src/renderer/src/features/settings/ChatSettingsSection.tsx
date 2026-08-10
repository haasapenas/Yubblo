import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

export interface ChatSettingsSectionProps {
  pauseOnHover: boolean
  showFocusModeShortcut: boolean
  busy: boolean
  onPauseOnHoverChange(enabled: boolean): void
  onShowFocusModeShortcutChange(enabled: boolean): void
}

export function ChatSettingsSection({
  pauseOnHover,
  showFocusModeShortcut,
  busy,
  onPauseOnHoverChange,
  onShowFocusModeShortcutChange
}: ChatSettingsSectionProps): ReactElement {
  const { t } = useTranslation('settings')
  return (
    <>
      <div className="settings-row">
        <div className="sr-text">
          <div className="sr-title">{t('chat.pauseOnHover')}</div>
          <div className="sr-desc">{t('chat.pauseOnHoverHelp')}</div>
        </div>
        <div className="sr-control">
          <input
            type="checkbox"
            aria-label={t('chat.pauseOnHover')}
            checked={pauseOnHover}
            disabled={busy}
            onChange={(event) => onPauseOnHoverChange(event.target.checked)}
          />
        </div>
      </div>
      <div className="settings-row">
        <div className="sr-text">
          <div className="sr-title">{t('chat.showFocusModeShortcut')}</div>
          <div className="sr-desc">{t('chat.showFocusModeShortcutHelp')}</div>
        </div>
        <div className="sr-control">
          <input
            type="checkbox"
            aria-label={t('chat.showFocusModeShortcut')}
            checked={showFocusModeShortcut}
            disabled={busy}
            onChange={(event) =>
              onShowFocusModeShortcutChange(event.target.checked)
            }
          />
        </div>
      </div>
    </>
  )
}
