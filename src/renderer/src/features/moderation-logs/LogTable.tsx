import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModerationLogEntry } from '../../../../shared/contracts/moderation-logs'
import { formatIsoDateForLocale } from '../../../../shared/i18n/date'

export interface LogTableProps {
  entries: ModerationLogEntry[]
  emptyLabel: string
}

export function LogTable({ entries, emptyLabel }: LogTableProps): ReactElement {
  const { t, i18n } = useTranslation('moderationLogs')
  const locale = i18n.resolvedLanguage || i18n.language

  if (entries.length === 0) {
    return <div className="ml-empty">{emptyLabel}</div>
  }

  return (
    <div className="ml-table-wrap">
      <table className="ml-table">
        <thead>
          <tr>
            <th>{t('col.date')}</th>
            <th>{t('col.time')}</th>
            <th>{t('col.moderator')}</th>
            <th>{t('col.user')}</th>
            <th>{t('col.action')}</th>
            <th>{t('col.message')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={`${entry.date}-${entry.time}-${entry.user}-${index}`}>
              <td>{formatIsoDateForLocale(entry.date, locale)}</td>
              <td>{entry.time}</td>
              <td>{entry.moderator || t('unknownName')}</td>
              <td>{entry.user || t('unknownName')}</td>
              <td>
                <span className={`ml-action ${entry.action}`}>
                  {t(`actions.${entry.action}`)}
                </span>
              </td>
              <td className="msg">{entry.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
