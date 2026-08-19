import { useMemo } from 'react'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactElement,
  RefObject
} from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type {
  ChatActionButton,
  ChatMessage,
  ChatStatus,
  HighlightRule,
  MonitoringSettings
} from '../../../../shared/types'
import { ChatPauseIndicator } from './ChatPauseIndicator'
import { MessageRow } from './MessageRow'
import { buildDeletedMessageIndex } from './deleted-message-index'
import type { SelfHighlightInput } from '../settings/highlights'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'
import { latestBanTombstoneIds } from '../moderation/moderation-projection'

export interface MessageListProps {
  messages: readonly ChatMessage[]
  sourceMessages: readonly ChatMessage[]
  status: ChatStatus
  chatFontSize?: number
  isHoverPaused: boolean
  virtuosoRef: RefObject<VirtuosoHandle | null>
  onAtBottomChange(atBottom: boolean): void
  onMouseEnter(): void
  onMouseLeave(): void
  canModerate: boolean
  canReply?: boolean
  highlights: HighlightRule[]
  monitoring?: MonitoringSettings
  selfHighlight?: SelfHighlightInput
  actionButtons: ChatActionButton[]
  actionBusyIds: ReadonlySet<string>
  expandedDeletedIds: ReadonlySet<string>
  channelHandle?: string
  channelName?: string
  onQuickAction(message: ChatMessage, action: ChatActionButton): void
  onOpenMenu(message: ChatMessage, event: ReactMouseEvent): void
  onOpenChannelActivity(message: ChatMessage): void
  onReply?(message: ChatMessage): void
  onHeldAction(message: ChatMessage, iconType: string): void
  onToggleDeleted(messageId: string): void
  onRemoveBan(channelId: string, systemMessageId: string): void
  onWarmMenu(messageId: string): void
  searchMatchIndexes?: ReadonlySet<number>
  searchActiveIndex?: number | null
}

export function MessageList({
  messages,
  sourceMessages,
  status,
  chatFontSize = 13,
  isHoverPaused,
  virtuosoRef,
  onAtBottomChange,
  onMouseEnter,
  onMouseLeave,
  canModerate,
  canReply = false,
  highlights,
  monitoring = { users: [], color: '#58249ccc' },
  selfHighlight,
  actionButtons,
  actionBusyIds,
  expandedDeletedIds,
  channelHandle,
  channelName,
  onQuickAction,
  onOpenMenu,
  onOpenChannelActivity,
  onReply,
  onHeldAction,
  onToggleDeleted,
  onRemoveBan,
  onWarmMenu,
  searchMatchIndexes,
  searchActiveIndex = null
}: MessageListProps): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  const normalizedFontSize = Number.isFinite(chatFontSize)
    ? Math.min(72, Math.max(6, Math.round(chatFontSize)))
    : 13
  const fontStyle = {
    '--chat-font-size': `${normalizedFontSize}px`,
    '--chat-secondary-font-size': `${Math.max(6, normalizedFontSize - 2)}px`,
    '--chat-small-font-size': `${Math.max(6, normalizedFontSize - 3)}px`,
    '--chat-tiny-font-size': `${Math.max(6, normalizedFontSize - 4)}px`
  } as CSSProperties
  const deletedMessageIndex = useMemo(
    () => buildDeletedMessageIndex(sourceMessages),
    [sourceMessages]
  )
  const latestBanIds = useMemo(
    () => latestBanTombstoneIds(messages),
    [messages]
  )
  const empty = (
    <div className="empty">
      <div className="empty-title">
        {status === 'live'
            ? t('waitingMessages')
            : status === 'ended'
              ? t('channelOffline')
              : t('noLive')}
      </div>
      {status === 'ended' && (
        <p className="empty-hint">{t('offlineHint')}</p>
      )}
    </div>
  )

  return (
    <div
      className="messages-shell"
      style={fontStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {messages.length === 0 ? empty : (
        <Virtuoso
          ref={virtuosoRef}
          className="messages"
          data={messages}
          computeItemKey={(_index, message) => message.id}
          followOutput={isHoverPaused ? false : true}
          atBottomStateChange={onAtBottomChange}
          atBottomThreshold={80}
          overscan={80}
          increaseViewportBy={{ top: 240, bottom: 320 }}
          itemContent={(absoluteIndex, message) => (
            <MessageRow
              message={message}
              index={absoluteIndex}
              canModerate={canModerate}
              canUnban={latestBanIds.has(message.id)}
              canReply={canReply}
              highlights={highlights}
              monitoring={monitoring}
              selfHighlight={selfHighlight}
              actionButtons={actionButtons}
              actionBusyIds={actionBusyIds}
              expandedDeleted={expandedDeletedIds.has(message.id)}
              resolvedDeletedText={deletedMessageIndex.get(message.id)}
              channelHandle={channelHandle}
              channelName={channelName}
              onQuickAction={onQuickAction}
              onOpenMenu={onOpenMenu}
              onOpenChannelActivity={onOpenChannelActivity}
              onReply={onReply}
              onHeldAction={onHeldAction}
              onToggleDeleted={onToggleDeleted}
              onRemoveBan={onRemoveBan}
              onWarmMenu={onWarmMenu}
              searchHit={searchMatchIndexes?.has(absoluteIndex) === true}
              searchCurrent={searchActiveIndex === absoluteIndex}
            />
          )}
        />
      )}
      <ChatPauseIndicator visible={isHoverPaused} />
    </div>
  )
}
