import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { ChatUserProfileTarget } from '../../../shared/channel-profile'
import type { AppError } from '../../../shared/types'
import { resolveChannelActivityTarget } from '../features/channel-activity/channel-activity-target'
import type { ThreadRowProps } from '../features/threads/ThreadPanel'

type Handlers = Pick<
  ThreadRowProps,
  | 'onQuickAction'
  | 'onOpenMenu'
  | 'onOpenChannelActivity'
  | 'onOpenUserProfile'
  | 'onHeldAction'
  | 'onToggleDeleted'
  | 'onRemoveBan'
>

export interface ChatRowHandlerDeps {
  activeVideoId: string | null
  toggleMonitoring?(target: { channelId: string; name: string }): void
  runQuickAction(action: Parameters<ThreadRowProps['onQuickAction']>[1], message: Parameters<ThreadRowProps['onQuickAction']>[0]): Promise<unknown>
  openModMenu(...args: Parameters<ThreadRowProps['onOpenMenu']>): Promise<unknown>
  handleHeldAction(...args: Parameters<ThreadRowProps['onHeldAction']>): Promise<unknown>
  handleRemoveBan(...args: Parameters<ThreadRowProps['onRemoveBan']>): Promise<unknown>
  setError: Dispatch<SetStateAction<AppError | null>>
  setUserProfileTarget: Dispatch<SetStateAction<ChatUserProfileTarget | null>>
  setExpandedDeletedIds: Dispatch<SetStateAction<Set<string>>>
}

export function useChatRowHandlers({
  activeVideoId,
  toggleMonitoring,
  runQuickAction,
  openModMenu,
  handleHeldAction,
  handleRemoveBan,
  setError,
  setUserProfileTarget,
  setExpandedDeletedIds
}: ChatRowHandlerDeps): Handlers {
  const onQuickAction = useCallback<Handlers['onQuickAction']>((message, action) => {
    if (action.kind === 'monitor') {
      if (message.authorChannelId && !message.pending && !message.failed && !message.removed) {
        toggleMonitoring?.({ channelId: message.authorChannelId, name: message.authorName })
      }
      return
    }
    void runQuickAction(action, message)
  }, [runQuickAction, toggleMonitoring])

  const onOpenMenu = useCallback<Handlers['onOpenMenu']>((message, event) => {
    void openModMenu(message, event)
  }, [openModMenu])

  const onOpenChannelActivity = useCallback<Handlers['onOpenChannelActivity']>((message) => {
    const target = resolveChannelActivityTarget(activeVideoId, message)
    if (!target) return
    void window.yubblo.chat.openChannelActivityWindow(target).catch((cause) => {
      setError({ code: 'UNKNOWN', message: cause instanceof Error ? cause.message : String(cause) })
    })
  }, [activeVideoId, setError])

  const onOpenUserProfile = useCallback<NonNullable<Handlers['onOpenUserProfile']>>((message) => {
    setUserProfileTarget({
      authorName: message.authorName,
      authorChannelId: message.authorChannelId,
      authorAvatarUrl: message.authorAvatarUrl
    })
  }, [setUserProfileTarget])

  const onHeldAction = useCallback<Handlers['onHeldAction']>((message, iconType) => {
    void handleHeldAction(message, iconType)
  }, [handleHeldAction])

  const onToggleDeleted = useCallback<Handlers['onToggleDeleted']>((messageId) => {
    setExpandedDeletedIds((previous) => {
      const next = new Set(previous)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }, [setExpandedDeletedIds])

  const onRemoveBan = useCallback<Handlers['onRemoveBan']>((channelId, systemMessageId) => {
    void handleRemoveBan(channelId, systemMessageId)
  }, [handleRemoveBan])

  return useMemo(() => ({
    onQuickAction,
    onOpenMenu,
    onOpenChannelActivity,
    onOpenUserProfile,
    onHeldAction,
    onToggleDeleted,
    onRemoveBan
  }), [onQuickAction, onOpenMenu, onOpenChannelActivity, onOpenUserProfile, onHeldAction, onToggleDeleted, onRemoveBan])
}
