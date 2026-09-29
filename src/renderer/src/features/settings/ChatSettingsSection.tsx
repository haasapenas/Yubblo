import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { PillToggle } from './ui/PillToggle'

const STANDARD_FONT_SIZES = [
  6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72
]
const STANDARD_MESSAGE_PADDINGS = [0, 1, 2, 3, 4, 6, 8, 10, 12]

export interface ChatSettingsSectionProps {
  chatFontSize: number
  chatMessagePadding: number
  separateMessages: boolean
  pauseOnHover: boolean
  showFocusModeShortcut: boolean
  colorizeUsernames: boolean
  busy: boolean
  onChatFontSizeChange(fontSize: number): void
  onChatMessagePaddingChange(padding: number): void
  onSeparateMessagesChange(enabled: boolean): void
  onPauseOnHoverChange(enabled: boolean): void
  onShowFocusModeShortcutChange(enabled: boolean): void
  onColorizeUsernamesChange(enabled: boolean): void
}

export function ChatSettingsSection({
  chatFontSize,
  chatMessagePadding,
  separateMessages,
  pauseOnHover,
  showFocusModeShortcut,
  colorizeUsernames,
  busy,
  onChatFontSizeChange,
  onChatMessagePaddingChange,
  onSeparateMessagesChange,
  onPauseOnHoverChange,
  onShowFocusModeShortcutChange,
  onColorizeUsernamesChange
}: ChatSettingsSectionProps): ReactElement {
  const { t } = useTranslation('settings')
  const fontSizes = STANDARD_FONT_SIZES.includes(chatFontSize)
    ? STANDARD_FONT_SIZES
    : [...STANDARD_FONT_SIZES, chatFontSize].sort((left, right) => left - right)
  const paddings = STANDARD_MESSAGE_PADDINGS.includes(chatMessagePadding)
    ? STANDARD_MESSAGE_PADDINGS
    : [...STANDARD_MESSAGE_PADDINGS, chatMessagePadding].sort((left, right) => left - right)
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
          <div className="sr-title">{t('chat.messagePadding')}</div>
        </div>
        <div className="sr-control">
          <select
            className="chat-font-size-input"
            data-testid="chat-message-padding"
            aria-label={t('chat.messagePadding')}
            value={chatMessagePadding}
            disabled={busy}
            onChange={(event) => onChatMessagePaddingChange(Number(event.target.value))}
          >
            {paddings.map((padding) => (
              <option key={padding} value={padding}>
                {padding} px
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="settings-row">
        <div className="sr-text">
          <div className="sr-title">{t('chat.separateMessages')}</div>
        </div>
        <div className="sr-control">
          <PillToggle
            aria-label={t('chat.separateMessages')}
            checked={separateMessages}
            onChange={onSeparateMessagesChange}
          />
        </div>
      </div>
      <div className="settings-row">
        <div className="sr-text">
          <div className="sr-title">{t('chat.pauseOnHover')}</div>
        </div>
        <div className="sr-control">
          <PillToggle
            aria-label={t('chat.pauseOnHover')}
            checked={pauseOnHover}
            onChange={onPauseOnHoverChange}
          />
        </div>
      </div>
      <div className="settings-row">
        <div className="sr-text">
          <div className="sr-title">{t('chat.showFocusModeShortcut')}</div>
          <div className="sr-desc">{t('chat.showFocusModeShortcutHelp')}</div>
        </div>
        <div className="sr-control">
          <PillToggle
            aria-label={t('chat.showFocusModeShortcut')}
            checked={showFocusModeShortcut}
            onChange={onShowFocusModeShortcutChange}
          />
        </div>
      </div>
      <div className="settings-row">
        <div className="sr-text">
          <div className="sr-title">{t('chat.colorizeUsernames')}</div>
          <div className="sr-desc">{t('chat.colorizeUsernamesHelp')}</div>
        </div>
        <div className="sr-control">
          <PillToggle
            aria-label={t('chat.colorizeUsernames')}
            checked={colorizeUsernames}
            onChange={onColorizeUsernamesChange}
          />
        </div>
      </div>
    </>
  )
}
