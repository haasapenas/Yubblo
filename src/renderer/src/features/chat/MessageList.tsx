import { useMemo } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  ReactElement,
  RefObject
} from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type {
  ChatActionButton,
  ChatMessage,
  ChatStatus,
  HighlightRule
} from '../../../../shared/types'
import { ChatPauseIndicator } from './ChatPauseIndicator'
import { MessageRow } from './MessageRow'
import { buildDeletedMessageIndex } from './deleted-message-index'
import type { SelfHighlightInput } from '../settings/highlights'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

export interface MessageListProps {
  messages: readonly ChatMessage[]
  sourceMessages: readonly ChatMessage[]
  status: ChatStatus
  isHoverPaused: boolean
  virtuosoRef: RefObject<VirtuosoHandle | null>
  onAtBottomChange(atBottom: boolean): void
  onMouseEnter(): void
  onMouseLeave(): void
  canModerate: boolean
  highlights: HighlightRule[]
  selfHighlight?: SelfHighlightInput
  actionButtons: ChatActionButton[]
  actionBusyIds: ReadonlySet<string>
  expandedDeletedIds: ReadonlySet<string>
  channelHandle?: string
  channelName?: string
  onQuickAction(message: ChatMessage, action: ChatActionButton): void
  onOpenMenu(message: ChatMessage, event: ReactMouseEvent): void
  onOpenChannelActivity(message: ChatMessage): void
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
  isHoverPaused,
  virtuosoRef,
  onAtBottomChange,
  onMouseEnter,
  onMouseLeave,
  canModerate,
  highlights,
  selfHighlight,
  actionButtons,
  actionBusyIds,
  expandedDeletedIds,
  channelHandle,
  channelName,
  onQuickAction,
  onOpenMenu,
  onOpenChannelActivity,
  onHeldAction,
  onToggleDeleted,
  onRemoveBan,
  onWarmMenu,
  searchMatchIndexes,
  searchActiveIndex = null
}: MessageListProps): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  const deletedMessageIndex = useMemo(
    () => buildDeletedMessageIndex(sourceMessages),
    [sourceMessages]
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
              highlights={highlights}
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