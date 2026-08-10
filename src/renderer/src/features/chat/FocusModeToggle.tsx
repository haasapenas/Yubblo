import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

export interface FocusModeToggleProps {
  enabled: boolean
  onToggle(): void
}

export function FocusModeToggle({
  enabled,
  onToggle
}: FocusModeToggleProps): ReactElement {
  const { t } = useTranslation('common')
  const title = enabled
    ? t('status.disableFocusMode')
    : t('status.enableFocusMode')
  return (
    <button
      type="button"
      className={`focus-mode-toggle${enabled ? ' active' : ''}`}
      aria-pressed={enabled}
      aria-label={title}
      title={title}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4C6.5 4 2.1 7.4.5 12 2.1 16.6 6.5 20 12 20s9.9-3.4 11.5-8C21.9 7.4 17.5 4 12 4Zm0 13a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-3a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
      </svg>
      {t('status.focusMode')}
    </button>
  )
}
