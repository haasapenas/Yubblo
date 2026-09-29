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
import { useStableRowIndex } from './use-stable-row-index'
import type { SelfHighlightInput } from '../settings/highlights'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'
import { latestBanTombstoneIds } from '../moderation/moderation-projection'
import type { ThreadLink } from '../threads/thread-index'
import type { AppBadgeId } from '../../../../shared/app-badges'

export interface MessageListProps {
  messages: readonly ChatMessage[]
  sourceMessages: readonly ChatMessage[]
  status: ChatStatus
  chatFontSize?: number
  chatMessagePadding?: number
  separateMessages?: boolean
  colorizeUsernames?: boolean
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
  onOpenUserProfile?(message: ChatMessage): void
  onReply?(message: ChatMessage): void
  onHeldAction(message: ChatMessage, iconType: string): void
  onToggleDeleted(messageId: string): void
  onRemoveBan(channelId: string, systemMessageId: string): void
  onWarmMenu(messageId: string): void
  searchMatchIndexes?: ReadonlySet<number>
  searchActiveIndex?: number | null
  threadLinks?: ReadonlyMap<string, ThreadLink>
  onOpenThread?(messageId: string): void
  showModMenu?: boolean
  repeatCounts?: ReadonlyMap<string, number>
  appBadges?: ReadonlyMap<string, AppBadgeId>
}

const DEFAULT_MONITORING: MonitoringSettings = { users: [], color: '#58249ccc' }

export function MessageList({
  messages,
  sourceMessages,
  status,
  chatFontSize = 13,
  chatMessagePadding = 2,
  separateMessages = false,
  colorizeUsernames = false,
  isHoverPaused,
  virtuosoRef,
  onAtBottomChange,
  onMouseEnter,
  onMouseLeave,
  canModerate,
  canReply = false,
  highlights,
  monitoring = DEFAULT_MONITORING,
  selfHighlight,
  actionButtons,
  actionBusyIds,
  expandedDeletedIds,
  channelHandle,
  channelName,
  onQuickAction,
  onOpenMenu,
  onOpenChannelActivity,
  onOpenUserProfile,
  onReply,
  onHeldAction,
  onToggleDeleted,
  onRemoveBan,
  onWarmMenu,
  searchMatchIndexes,
  searchActiveIndex = null,
  threadLinks,
  onOpenThread,
  showModMenu = true,
  repeatCounts,
  appBadges
}: MessageListProps): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  const normalizedFontSize = Number.isFinite(chatFontSize)
    ? Math.min(72, Math.max(6, Math.round(chatFontSize)))
    : 13
  const normalizedPadding = Number.isFinite(chatMessagePadding)
    ? Math.min(12, Math.max(0, Math.round(chatMessagePadding)))
    : 2
  const fontStyle = {
    '--chat-font-size': `${normalizedFontSize}px`,
    '--chat-secondary-font-size': `${Math.max(6, normalizedFontSize - 2)}px`,
    '--chat-small-font-size': `${Math.max(6, normalizedFontSize - 3)}px`,
    '--chat-tiny-font-size': `${Math.max(6, normalizedFontSize - 4)}px`,
    '--chat-pad-y': `${normalizedPadding}px`
  } as CSSProperties
  const deletedMessageIndex = useMemo(
    () => buildDeletedMessageIndex(sourceMessages),
    [sourceMessages]
  )
  const rowIndex = useStableRowIndex(messages)
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
      className={`messages-shell${separateMessages ? ' separate-lines' : ''}`}
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
              index={rowIndex.get(message.id) ?? absoluteIndex}
              canModerate={canModerate}
              colorizeUsernames={colorizeUsernames}
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
              onOpenUserProfile={onOpenUserProfile}
              onReply={onReply}
              onHeldAction={onHeldAction}
              onToggleDeleted={onToggleDeleted}
              onRemoveBan={onRemoveBan}
              onWarmMenu={onWarmMenu}
              searchHit={searchMatchIndexes?.has(absoluteIndex) === true}
              searchCurrent={searchActiveIndex === absoluteIndex}
              replyContext={threadLinks?.get(message.id)}
              onOpenThread={onOpenThread}
              showModMenu={showModMenu}
              repeatCount={repeatCounts?.get(message.id)}
              appBadge={message.authorChannelId ? appBadges?.get(message.authorChannelId) : undefined}
            />
          )}
        />
      )}
      <ChatPauseIndicator visible={isHoverPaused} />
    </div>
  )
}
