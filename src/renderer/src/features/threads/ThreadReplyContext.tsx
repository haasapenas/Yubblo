import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'
import type { ThreadLink } from './thread-index'
import './threads.css'

export function ThreadReplyContext({
  link,
  onOpen
}: {
  link: ThreadLink
  onOpen?(): void
}): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  const name = `@${link.parentAuthorName.replace(/^@+/, '')}`
  return (
    <button
      type="button"
      className="msg-thread-context"
      title={t('threads.open')}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpen?.()
      }}
    >
      <svg className="msg-thread-context-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 7V3l-7 7 7 7v-4c5 0 8.5 1.6 11 5-1-5.1-4.2-10-11-11Z" />
      </svg>
      <span className="msg-thread-context-label">
        {t('threads.replyingTo', { user: name })}
        {link.parentExcerpt ? ':' : ''}
      </span>
      {link.parentExcerpt && (
        <span className="msg-thread-context-excerpt">{link.parentExcerpt}</span>
      )}
    </button>
  )
}
