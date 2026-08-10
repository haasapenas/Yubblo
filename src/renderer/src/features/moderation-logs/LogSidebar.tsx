import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ModerationLogChannelGroup,
  ModerationLogStreamKey
} from '../../../../shared/contracts/moderation-logs'
import { formatIsoDateForLocale } from '../../../../shared/i18n/date'

export interface LogSidebarProps {
  groups: ModerationLogChannelGroup[]
  selectedKey: ModerationLogStreamKey | null
  onSelect(key: ModerationLogStreamKey): void
}

export function LogSidebar({
  groups,
  selectedKey,
  onSelect
}: LogSidebarProps): ReactElement {
  const { t, i18n } = useTranslation('moderationLogs')
  const locale = i18n.resolvedLanguage || i18n.language

  if (groups.length === 0) {
    return (
      <aside className="ml-sidebar">
        <div className="ml-empty">{t('emptyChannels')}</div>
      </aside>
    )
  }

  return (
    <aside className="ml-sidebar" aria-label={t('sidebar')}>
      {groups.map((group) => (
        <div key={group.channelId} className="ml-channel">
          <div className="ml-channel-name">{group.channelName}</div>
          {group.streams.map((stream) => (
            <button
              key={stream.key}
              type="button"
              className={`ml-stream-btn${selectedKey === stream.key ? ' active' : ''}`}
              onClick={() => onSelect(stream.key)}
            >
              <span className="ml-stream-title">{stream.title || stream.videoId}</span>
              <span className="ml-stream-meta">
                {formatIsoDateForLocale(stream.date, locale)}
                {stream.counts.total > 0
                  ? ` · ${stream.counts.total}`
                  : ''}
              </span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  )
}
