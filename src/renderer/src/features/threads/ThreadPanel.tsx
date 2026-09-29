import { useEffect, useRef, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { VirtuosoHandle } from 'react-virtuoso'
import type { ChatMessage } from '../../../../shared/types'
import { i18n } from '../../i18n/i18n-renderer'
import { MessageList, type MessageListProps } from '../chat/MessageList'
import './threads.css'

export type ThreadRowProps = Omit<
  MessageListProps,
  | 'messages'
  | 'sourceMessages'
  | 'status'
  | 'isHoverPaused'
  | 'virtuosoRef'
  | 'onAtBottomChange'
  | 'onMouseEnter'
  | 'onMouseLeave'
  | 'searchMatchIndexes'
  | 'searchActiveIndex'
  | 'threadLinks'
  | 'onOpenThread'
  | 'showModMenu'
>

const noop = (): void => undefined

export function ThreadPanel({
  messages,
  sourceMessages,
  rowProps,
  onClose
}: {
  messages: readonly ChatMessage[]
  sourceMessages: readonly ChatMessage[]
  rowProps: ThreadRowProps
  onClose(): void
}): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  const replyTarget = [...messages].reverse().find((message) =>
    !message.isSelf && !message.removed && !message.systemKind
  )

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="thread-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="thread-panel" role="dialog" aria-modal="true" aria-label={t('threads.title')}>
        <header className="thread-head">
          <span className="thread-badge">{t('threads.title')}</span>
          <span className="thread-count">{t('threads.count', { count: messages.length })}</span>
          <button type="button" className="thread-close" onClick={onClose} aria-label={t('threads.close')}>
            ×
          </button>
        </header>
        <div className="thread-body">
          <MessageList
            {...rowProps}
            messages={messages}
            sourceMessages={sourceMessages}
            status="live"
            isHoverPaused={false}
            virtuosoRef={virtuosoRef}
            onAtBottomChange={noop}
            onMouseEnter={noop}
            onMouseLeave={noop}
            showModMenu={false}
          />
        </div>
        {rowProps.canReply && replyTarget && rowProps.onReply && (
          <footer className="thread-foot">
            <button
              type="button"
              className="btn btn-ghost thread-reply"
              onClick={() => {
                rowProps.onReply?.(replyTarget)
                onClose()
              }}
            >
              {t('threads.replyTo', { user: replyTarget.authorName })}
            </button>
          </footer>
        )}
      </section>
    </div>
  )
}
