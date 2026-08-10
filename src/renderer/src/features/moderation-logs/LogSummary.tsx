import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModerationLogStreamSummary } from '../../../../shared/contracts/moderation-logs'

export interface LogSummaryProps {
  counts: ModerationLogStreamSummary['counts']
}

export function LogSummary({ counts }: LogSummaryProps): ReactElement {
  const { t } = useTranslation('moderationLogs')
  return (
    <div className="ml-summary" aria-label={t('summary')}>
      <span className="ml-chip">
        {t('summaryTimeout', { count: counts.timeout })}
      </span>
      <span className="ml-chip">
        {t('summaryDeleted', { count: counts.deleted })}
      </span>
      <span className="ml-chip">
        {t('summaryHide', { count: counts.hide })}
      </span>
      <span className="ml-chip">
        {t('summaryTotal', { count: counts.total })}
      </span>
    </div>
  )
}
