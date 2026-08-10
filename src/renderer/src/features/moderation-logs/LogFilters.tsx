import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ModerationLogAction,
  ModerationLogFilters
} from '../../../../shared/contracts/moderation-logs'

export interface LogFiltersProps {
  filters: ModerationLogFilters
  onChange(next: ModerationLogFilters): void
}

const ACTIONS: ModerationLogAction[] = ['timeout', 'deleted', 'hide']

export function LogFilters({ filters, onChange }: LogFiltersProps): ReactElement {
  const { t } = useTranslation('moderationLogs')
  const selected = new Set(filters.actions || [])

  function toggleAction(action: ModerationLogAction): void {
    const next = new Set(selected)
    if (next.has(action)) next.delete(action)
    else next.add(action)
    onChange({
      ...filters,
      actions: next.size === ACTIONS.length || next.size === 0 ? undefined : [...next]
    })
  }

  return (
    <div className="ml-filters">
      <input
        type="search"
        value={filters.query || ''}
        placeholder={t('searchPlaceholder')}
        onChange={(e) =>
          onChange({ ...filters, query: e.target.value || undefined })
        }
      />
      <input
        type="date"
        value={filters.dateFrom || ''}
        title={t('dateFrom')}
        onChange={(e) =>
          onChange({ ...filters, dateFrom: e.target.value || undefined })
        }
      />
      <input
        type="date"
        value={filters.dateTo || ''}
        title={t('dateTo')}
        onChange={(e) =>
          onChange({ ...filters, dateTo: e.target.value || undefined })
        }
      />
      {ACTIONS.map((action) => (
        <label key={action}>
          <input
            type="checkbox"
            checked={selected.size === 0 || selected.has(action)}
            onChange={() => toggleAction(action)}
          />
          {t(`actions.${action}`)}
        </label>
      ))}
    </div>
  )
}
