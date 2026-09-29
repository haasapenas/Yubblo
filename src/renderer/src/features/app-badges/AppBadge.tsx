import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppBadgeId } from '../../../../shared/app-badges'
import { i18n } from '../../i18n/i18n-renderer'
import './app-badge.css'

const LABEL_KEYS = { dev: 'appBadge.dev' } as const satisfies Record<AppBadgeId, string>

export function AppBadge({ id }: { id: AppBadgeId }): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  const label = t(LABEL_KEYS[id])
  return (
    <span className={`app-badge app-badge-${id}`} role="img" title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" width="12" height="12" focusable="false" aria-hidden="true">
        <path
          d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
