import { memo, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react'
import type {
  ChatActionButton,
  ChatMessage,
  HighlightRule
} from '../../../../shared/types'
import { findHighlight, type SelfHighlightInput } from '../settings/highlights'
import { highlightBackgroundColor, opaqueHighlightColor } from '../settings/highlights/highlight-color'
import { expandCommandTemplate, parseSystemModText } from '../moderation/moderation-ui'
import { formatSystemModerationText } from '../moderation/system-moderation-text'
import { formatTime } from '../../shared/format'
import { MessageBody } from './MessageBody'
import { formatChatNotice } from './chat-notice-text'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

export interface MessageRowProps {
  message: ChatMessage
  index: number
  canModerate: boolean
  highlights: HighlightRule[]
  selfHighlight?: SelfHighlightInput
  actionButtons: ChatActionButton[]
  actionBusyIds: ReadonlySet<string>
  expandedDeleted: boolean
  resolvedDeletedText?: string
  channelHandle?: string
  channelName?: string
  onQuickAction(message: ChatMessage, action: ChatActionButton): void
  onOpenMenu(message: ChatMessage, event: ReactMouseEvent): void
  onOpenChannelActivity?(message: ChatMessage): void
  onHeldAction(message: ChatMessage, iconType: string): void
  onToggleDeleted(messageId: string): void
  onRemoveBan(channelId: string, systemMessageId: string): void
  onWarmMenu(messageId: string): void
  /** Match da busca Ctrl+F */
  searchHit?: boolean
  searchCurrent?: boolean
}

export const MessageRow = memo(function MessageRow({
  message,
  index,
  canModerate,
  highlights,
  selfHighlight,
  actionButtons,
  actionBusyIds,
  expandedDeleted,
  resolvedDeletedText,
  channelHandle,
  channelName,
  onQuickAction,
  onOpenMenu,
  onOpenChannelActivity,
  onHeldAction,
  onToggleDeleted,
  onRemoveBan,
  onWarmMenu,
  searchHit = false,
  searchCurrent = false
}: MessageRowProps): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  const canOpenAuthor = Boolean(
    onOpenChannelActivity &&
    message.authorChannelId &&
    !message.pending &&
    !message.failed &&
    (!message.id.startsWith('local-') || message.hasContextMenu)
  )
  const author = (className: string): ReactElement => canOpenAuthor ? (
    <span
      role="button"
      tabIndex={0}
      className={`${className} msg-author-activity`}
      aria-label={i18n.t('channelActivity:openUserActivity', { user: message.authorName })}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpenChannelActivity?.(message)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        onOpenChannelActivity?.(message)
      }}
    >{message.authorName}:</span>
  ) : <span className={className}>{message.authorName}:</span>
  const stripe = index % 2 === 1 ? ' msg-stripe' : ''
  const searchCls = searchCurrent
    ? ' msg-search-current'
    : searchHit
      ? ' msg-search-hit'
      : ''

  if (message.systemNotice) {
    return (
      <div
        data-idx={index}
        className={[
          'msg',
          'msg-notice',
          `msg-notice-${message.systemNotice.kind}`,
          stripe.trim(),
          searchCls.trim()
        ].filter(Boolean).join(' ')}
      >
        <div className="msg-time">{formatTime(message.timestamp)}</div>
        <div className="msg-body msg-notice-body">
          <span className="msg-notice-text">{formatChatNotice(message)}</span>
        </div>
      </div>
    )
  }

  if (message.heldForReview) {
    const heldBusyPrefix = `message:${message.id}:`
    const heldMessageBusy = [...actionBusyIds].some((key) =>
      key.startsWith(heldBusyPrefix)
    )
    const heldModerationActions = actionButtons.filter((action) =>
      action.kind === 'timeout' || action.kind === 'hide'
    )
    return (
      <div className={`msg msg-held${stripe}${searchCls}`} data-idx={index}>
        <div className="msg-time">{formatTime(message.timestamp)}</div>
        <div className="msg-body msg-held-body">
          <div className="msg-held-head">
            <span className="msg-held-badge">{t('heldReview.badge')}</span>
            <span className="msg-held-header">
              {t('heldReview.header')}
            </span>
          </div>
          <div className="msg-held-content">
            {author('msg-author self')}
            <MessageBody text={message.text} parts={message.parts} />
</div>
          {canModerate && heldModerationActions.length > 0 && (
            <div className="msg-held-actions">
              <span className="msg-actions">
                {heldModerationActions.map((action) => {
                  const busy = actionBusyIds.has(
                    `message:${message.id}:quick:${action.id}`
                  )
                  return (
                    <button
                      key={action.id}
                      type="button"
                      className={`msg-action-btn kind-${action.kind}`}
                      disabled={heldMessageBusy}
                      title={action.kind === 'timeout'
                        ? `Timeout ${action.timeoutKey || action.label}`
                        : action.label}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onQuickAction(message, action)
                      }}
                    >
                      {busy ? '…' : action.label}
                    </button>
                  )
                })}
              </span>
            </div>
          )}
          {canModerate && message.heldActions?.length ? (
            <div className="msg-held-actions">
              {message.heldActions.map((action) => {
                const busy = actionBusyIds.has(`message:${message.id}:held:${action.iconType}`)
                return (
                  <button
                    key={action.iconType}
                    type="button"
                    className={`msg-held-btn msg-held-btn-${action.action}`}
                    disabled={heldMessageBusy}
                    title={t(action.action === 'show' ? 'heldReview.show' : 'heldReview.hide')}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onHeldAction(message, action.iconType)
                    }}
                  >
                    {busy ? '…' : t(action.action === 'show' ? 'heldReview.show' : 'heldReview.hide')}
                  </button>
                )
              })}
            </div>
          ) : canModerate ? (
            <div className="msg-held-actions msg-held-actions-muted">
              {t('heldReview.unavailable')}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (message.systemKind) {
    const banBusy =
      message.systemKind === 'mod-hide' &&
      actionBusyIds.has(`unban:${message.systemTargetChannelId || message.id}`)
    const systemParts = parseSystemModText(
      formatSystemModerationText(message),
      message.systemTargetName
    )
    const deletedBody = resolvedDeletedText?.trim() || ''
    const canShowDeleted =
      message.systemKind === 'mod-delete' &&
      !!deletedBody &&
      deletedBody !== '(sem texto)'
    return (
      <div
        data-idx={index}
        className={[
          'msg',
          'msg-system',
          `msg-system-${message.systemKind}`,
          stripe.trim(),
          searchCls.trim()
        ].filter(Boolean).join(' ')}
      >
        <div className="msg-time">{formatTime(message.timestamp)}</div>
        <div className="msg-body msg-system-body">
          <span className="msg-system-text">
            {systemParts.target && <span className="msg-system-target">{systemParts.target}</span>}
            {canShowDeleted && expandedDeleted && (
              <span className="msg-system-deleted-inline"> {deletedBody}</span>
            )}
            {systemParts.rest && <span className="msg-system-rest"> {systemParts.rest}</span>}
            {canShowDeleted && (
              <> {' '}
                <button
                  type="button"
                  className="msg-sys-link"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onToggleDeleted(message.id)
                  }}
                >
                  {expandedDeleted ? t('deletedMessage.hide') : t('deletedMessage.show')}
                </button>
              </>
            )}
            {message.systemKind === 'mod-hide' && message.systemTargetChannelId && canModerate && (
              <> {' '}
                <button
                  type="button"
                  className="msg-sys-link"
                  disabled={banBusy}
                  title={t('message.unbanTitle', {
                    user: message.systemTargetName || t('systemModeration.unknownTarget')
                  })}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onRemoveBan(message.systemTargetChannelId!, message.id)
                  }}
                >
                  {banBusy ? '…' : t('message.unbanAction')}
                </button>
              </>
            )}
          </span>
        </div>
      </div>
    )
  }

  const messageBusyPrefix = `message:${message.id}:`
  const messageBusy = [...actionBusyIds].some((key) =>
    key.startsWith(messageBusyPrefix)
  )
  const highlight = findHighlight(message, highlights, selfHighlight)
  const highlightStyle: CSSProperties | undefined = highlight
    ? {
        background: highlightBackgroundColor(highlight.color),
        boxShadow: `inset 3px 0 0 ${opaqueHighlightColor(highlight.color)}`
      }
    : undefined
  return (
    <div
      className={[
        'msg',
        message.pending ? 'pending' : '',
        message.failed ? 'failed' : '',
        message.removed ? 'removed' : '',
        highlight ? 'highlighted' : '',
        stripe.trim(),
        searchCls.trim()
      ].filter(Boolean).join(' ')}
      data-idx={index}
      style={highlightStyle}
      title={highlight ? `Highlight: ${highlight.pattern}` : undefined}
      onContextMenu={message.removed ? undefined : (event) => onOpenMenu(message, event)}
      onMouseEnter={() => {
        if (!message.removed && (message.hasContextMenu || !message.id.startsWith('local-'))) {
          onWarmMenu(message.id)
        }
      }}
    >
      <div className="msg-time">{formatTime(message.timestamp)}</div>
      <div className="msg-body">
        {canModerate &&
          !message.failed &&
          !message.isSelf &&
          !message.removed &&
          actionButtons.length > 0 && (
            <span className="msg-actions">
              {actionButtons.map((action) => {
                const busy = actionBusyIds.has(`message:${message.id}:quick:${action.id}`)
                const needsContext = ['timeout', 'delete', 'hide', 'unhide'].includes(action.kind)
                if (needsContext && message.id.startsWith('local-') && !message.hasContextMenu) return null
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={`msg-action-btn kind-${action.kind}`}
                    style={action.color ? { color: action.color, borderColor: action.color } : undefined}
                    title={action.kind === 'command'
                      ? expandCommandTemplate(action.command || '', {
                          authorName: message.authorName,
                          channelHandle,
                          channelName,
                          messageText: message.text || ''
                        })
                      : action.kind === 'timeout'
                        ? t('message.timeout', { duration: action.timeoutKey || action.label })
                        : action.kind === 'delete'
                          ? t('message.delete')
                          : action.kind === 'hide'
                            ? t('message.hide')
                            : action.kind === 'unhide'
                              ? t('message.unhide')
                              : action.label}
                    disabled={messageBusy}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onQuickAction(message, action)
                    }}
                  >
                    {busy ? '…' : action.label}
                  </button>
                )
              })}
            </span>
          )}
        {message.isModerator && <span className="badge mod">MOD</span>}
        {message.isMember && !message.isModerator && <span className="badge member">{t('message.memberBadge')}</span>}
        {author([
          'msg-author',
          message.isOwner ? 'owner' : '',
          message.isModerator ? 'mod' : '',
          message.isMember ? 'member' : '',
          message.isSelf ? 'self' : ''
        ].filter(Boolean).join(' '))}
        <MessageBody text={message.text} parts={message.parts} removed={message.removed} />
        {message.failed && <span className="msg-hint fail"> {t('message.failed')}</span>}
      </div>
      {!message.failed && (message.hasContextMenu || !message.id.startsWith('local-')) && (
        <button
          type="button"
          className="msg-mod-btn"
          title={t('message.moderationTooltip')}
          onClick={(event) => onOpenMenu(message, event)}
        >
          ⋮
        </button>
      )}
    </div>
  )
})
