import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

const STANDARD_FONT_SIZES = [
  6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72
]

export interface ChatSettingsSectionProps {
  chatFontSize: number
  pauseOnHover: boolean
  showFocusModeShortcut: boolean
  busy: boolean
  onChatFontSizeChange(fontSize: number): void
  onPauseOnHoverChange(enabled: boolean): void
  onShowFocusModeShortcutChange(enabled: boolean): void
}

export function ChatSettingsSection({
  chatFontSize,
  pauseOnHover,
  showFocusModeShortcut,
  busy,
  onChatFontSizeChange,
  onPauseOnHoverChange,
  onShowFocusModeShortcutChange
}: ChatSettingsSectionProps): ReactElement {
  const { t } = useTranslation('settings')
  const fontSizes = STANDARD_FONT_SIZES.includes(chatFontSize)
    ? STANDARD_FONT_SIZES
    : [...STANDARD_FONT_SIZES, chatFontSize].sort((left, right) => left - right)
  return (
    <>
      <div className="settings-row">
        <div className="sr-text">
          <div className="sr-title">{t('chat.fontSize')}</div>
          <div className="sr-desc">{t('chat.fontSizeHelp')}</div>
        </div>
        <div className="sr-control">
          <select
            className="chat-font-size-input"
            data-testid="chat-font-size"
            aria-label={t('chat.fontSize')}
            value={chatFontSize}
            disabled={busy}
            onChange={(event) => onChatFontSizeChange(Number(event.target.value))}
          >
            {fontSizes.map((fontSize) => (
              <option key={fontSize} value={fontSize}>
                {fontSize} px
              </option>
            ))}
          </select>
        </div>
      </div>
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
