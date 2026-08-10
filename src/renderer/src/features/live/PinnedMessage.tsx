import type { ReactElement } from 'react'
import type { LivePinnedMessage as PinnedMessageValue } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

export function PinnedMessage({
  message,
  activeVideoId,
  onDismiss
}: {
  message: PinnedMessageValue | null
  activeVideoId: string | null
  onDismiss(): void
}): ReactElement | null {
  const { t } = useTranslation('chat', { i18n })
  if (!message || (message.videoId && message.videoId !== activeVideoId)) return null
  return (
    <div className="live-pin-bar" role="region" aria-label={t('pinnedMessage')}>
      <div className="live-pin-bar-icon" aria-hidden title={message.headerText || t('pinned')}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
        </svg>
      </div>
      <div className="live-pin-bar-content">
        <span className="live-pin-bar-author">{message.authorName}</span>
        <span className="live-pin-bar-sep"> </span>
        <span className="live-pin-bar-text">{message.text}</span>
      </div>
      <button
        type="button"
        className="live-pin-bar-close"
        title={t('dismissPinned')}
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}
