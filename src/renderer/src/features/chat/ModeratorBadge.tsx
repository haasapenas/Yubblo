import { useTranslation } from 'react-i18next'
import type { ReactElement } from 'react'
import { i18n } from '../../i18n/i18n-renderer'

const MODERATOR_SHIELD_PATH =
  'M3 4.998v9.857a6 6 0 003.365 5.39L12 23l5.635-2.755A6 6 0 0021 14.855V4.998a1 1 0 00-.656-.938L12 1 3.656 4.06A1 1 0 003 4.998Z'

export function ModeratorBadge(): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  const label = t('message.moderatorBadge')

  return (
    <span className="moderator-badge" role="img" title={label} aria-label={label}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        focusable="false"
        aria-hidden="true"
      >
        <path d={MODERATOR_SHIELD_PATH} fill="currentColor" />
      </svg>
    </span>
  )
}
