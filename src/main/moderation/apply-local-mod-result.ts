/**
 * Efeitos colaterais após moderação local confirmada (delete/timeout/hide).
 * Mantém chat-service enxuto e modular.
 */
import type { ChannelSession } from '../chat/chat-session'
import type { ChatMessage } from '../../shared/types'
import { resolveTimeoutDurationKey, type RawModEndpoint } from './moderation-parser'
import {
  logLocalDelete,
  logLocalTimeoutOrHide
} from '../moderation-logs/moderation-log-from-session'
import type { ModerationEchoSuppressor } from './moderation-activity'

type AuthorStore = {
  findAuthor(
    messageId: string
  ): { channelId?: string; name: string; text?: string } | undefined
  authorEntries(): IterableIterator<
    [string, { channelId?: string; name: string; text?: string }]
  >
}

export interface ApplyLocalModResultDeps {
  session: ChannelSession
  messageId: string
  videoId: string
  endpoint: RawModEndpoint
  modName: string
  targetChannelId: string
  targetName: string
  storedText?: string
  messageStore: AuthorStore
  echo: ModerationEchoSuppressor
  onRemoved: (payload: {
    messageId?: string
    authorChannelId?: string
    videoId?: string
    moderatedThrough?: number
  }) => void
  emitModSystemMessage: (
    videoId: string,
    opts: {
      systemKind: NonNullable<ChatMessage['systemKind']>
      systemTargetChannelId?: string
      systemTargetName?: string
      systemModeratorName?: string
      systemDurationKey?: string
      systemDeletedText?: string
      systemSourceMessageId?: string
      replacesId?: string
      id?: string
    }
  ) => void
  trackHiddenUser: (
    key: string,
    name: string,
    messageId: string,
    videoId: string,
    hideParams?: string
  ) => void
}

/** Aplica delete/timeout/hide. Retorna key de hide se aplicável. */
export function applyLocalModResult(
  deps: ApplyLocalModResultDeps
): { hideKey?: string } {
  const {
    session,
    messageId,
    videoId: vid,
    endpoint: ep,
    modName,
    targetChannelId: targetCh,
    targetName,
    storedText,
    messageStore,
    echo,
    onRemoved,
    emitModSystemMessage,
    trackHiddenUser
  } = deps

  if (ep.kind === 'delete') {
    const deletedText =
      messageStore.findAuthor(messageId)?.text?.trim() ||
      storedText?.trim() ||
      ''
    console.log(
      `[mod] delete text len=${deletedText.length} id=${messageId.slice(0, 12)}…`
    )
    echo.rememberLocal({
      videoId: vid,
      kind: 'delete',
      authorChannelId: targetCh || undefined,
      targetName,
      at: Date.now()
    })
    logLocalDelete({
      session,
      moderator: modName,
      user: targetName,
      message: deletedText
    })
    onRemoved({ messageId, videoId: vid || undefined })
    emitModSystemMessage(vid, {
      systemKind: 'mod-delete',
      systemTargetChannelId: targetCh || undefined,
      systemTargetName: targetName,
      systemModeratorName: modName,
      systemDeletedText: deletedText || '(sem texto)',
      systemSourceMessageId: messageId,
      replacesId: messageId
    })
    return {}
  }

  if (ep.kind === 'timeout' || ep.kind === 'hide') {
    const moderatedThrough = Date.now()
    echo.rememberLocal({
      videoId: vid,
      kind: ep.kind,
      authorChannelId: targetCh || undefined,
      targetName,
      at: moderatedThrough
    })
    logLocalTimeoutOrHide({
      session,
      action: ep.kind,
      moderator: modName,
      user: targetName,
      messageId,
      targetChannelId: targetCh,
      store: messageStore,
      storedText,
      at: moderatedThrough
    })
    onRemoved({
      authorChannelId: targetCh || undefined,
      messageId: targetCh ? undefined : messageId,
      videoId: vid || undefined,
      moderatedThrough: targetCh ? moderatedThrough : undefined
    })
    if (ep.kind === 'timeout') {
      emitModSystemMessage(vid, {
        systemKind: 'mod-timeout',
        systemDurationKey: resolveTimeoutDurationKey(ep.label, ep.iconType) || undefined,
        systemTargetChannelId: targetCh || undefined,
        systemTargetName: targetName,
        systemModeratorName: modName
      })
      return {}
    }
    const key = targetCh || `msg:${messageId}`
    const hideParams =
      typeof ep.body.params === 'string' ? ep.body.params : undefined
    trackHiddenUser(key, targetName, messageId, vid, hideParams)
    emitModSystemMessage(vid, {
      systemKind: 'mod-hide',
      systemTargetChannelId: key,
      systemTargetName: targetName,
      systemModeratorName: modName,
      id: `sys-ban-${key}-${Date.now()}`
    })
    return { hideKey: key }
  }

  return {}
}
