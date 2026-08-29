import type { ChatMessage } from '../../shared/types'
import {
  AUTOMOD_HIDE_ICON,
  AUTOMOD_SHOW_ICON,
  extractReleasedChatItemFromModerateResponse,
  type AutomodHeldParseResult,
  type AutomodReplaceParseResult
} from './automod-parser'
import type { RawModEndpoint } from './moderation-parser'

export type AutomodMessageSource = 'live' | 'bootstrap'

export interface AutomodContext {
  cacheEndpoints?(
    messageId: string,
    endpoints: RawModEndpoint[],
    videoId: string
  ): void
  storeHeldSnapshot?(message: ChatMessage, videoId: string): void
  emitMessage?(
    message: ChatMessage,
    videoId: string,
    source?: AutomodMessageSource
  ): void
  storeModeratableItem?(
    realId: string,
    localAliasId: string | undefined,
    rawItem: unknown,
    message: ChatMessage
  ): boolean
  deleteEndpointCache?(messageId: string, videoId: string): void
  upgradeReleasedMenu?(
    message: ChatMessage,
    videoId: string,
    rawItem?: unknown,
    source?: AutomodMessageSource
  ): boolean
  deleteItem?(messageId: string, videoId: string): void
  recoverMenu?(
    messageId: string,
    text: string,
    videoId: string,
    source?: AutomodMessageSource
  ): void
  emitRemoved?(payload: {
    messageId: string
    videoId?: string
    heldDismissed: true
  }): void
  activeVideoId?(): string | null
}

export interface HeldAutomodMessage {
  msg: ChatMessage
  videoId: string
  innerId?: string
}

export interface ReleasedAutomodMessage {
  localId: string
  text: string
  authorChannelId?: string
  at: number
}

export class AutomodService {
  private static readonly DISMISSED_TTL_MS = 30 * 60_000
  private static readonly DISMISSED_MAX = 200
  private static readonly RELEASED_TTL_MS = 90_000
  private static readonly RELEASED_MAX = 40

  private readonly held = new Map<string, HeldAutomodMessage>()
  private readonly innerToHeld = new Map<string, string>()
  private readonly dismissed = new Map<string, number>()
  private released: ReleasedAutomodMessage[] = []

  constructor(
    private readonly context?: AutomodContext,
    private readonly now: () => number = Date.now
  ) {}

  handleHeldBatch(
    items: AutomodHeldParseResult[],
    videoId: string
  ): void {
    for (const held of items) {
      const message = held.message
      if (!message?.id || this.isDismissed(message.id)) continue
      if (held.endpoints.length > 0) {
        this.context?.cacheEndpoints?.(message.id, held.endpoints, videoId)
      }
      const innerId =
        held.moderatableItem && typeof held.moderatableItem === 'object' &&
        typeof (held.moderatableItem as { id?: unknown }).id === 'string'
          ? (held.moderatableItem as { id: string }).id
          : undefined
      this.hold(message, videoId, innerId)
      const storedModeratable = held.moderatableItem
        ? this.context?.storeModeratableItem?.(
            message.id,
            undefined,
            held.moderatableItem,
            message
          ) ?? false
        : false
      if (!storedModeratable) {
        this.context?.storeHeldSnapshot?.(message, videoId)
      }
      this.context?.emitMessage?.(message, videoId)
    }
  }

  absorbReleaseEcho(
    message: ChatMessage,
    videoId: string,
    rawItem?: unknown,
    source: AutomodMessageSource = 'live'
  ): boolean {
    if (this.isDismissed(message.id)) return true
    const released = this.consumeRelease(message)
    if (!released) {
      const heldId = this.resolveHeldId(message.id)
      if (heldId) {
        const applied = this.applyRemoteReplace(
          {
            kind: 'show',
            targetItemId: heldId,
            replacementId: message.id,
            authorName: message.authorName,
            authorChannelId: message.authorChannelId,
            text: message.text,
            timestamp: message.timestamp,
            rawReplacement: rawItem ?? null
          },
          message,
          videoId,
          source
        )
        if (applied) return true
      }
      return this.context?.upgradeReleasedMenu?.(
        message,
        videoId,
        rawItem,
        source
      ) ?? false
    }
    if (this.isDismissed(released.localId)) return true

    const hasMenu = this.context?.storeModeratableItem?.(
      message.id,
      released.localId,
      rawItem,
      message
    ) ?? false
    this.context?.deleteEndpointCache?.(released.localId, videoId)
    this.context?.emitMessage?.(
      {
        ...message,
        replacesId:
          released.localId !== message.id && !this.isDismissed(released.localId)
            ? released.localId
            : undefined,
        heldForReview: false,
        heldHeader: undefined,
        heldActions: undefined,
        hasContextMenu: hasMenu || !!message.hasContextMenu
      },
      videoId,
      source
    )
    return true
  }

  applyRemoteReplace(
    parsed: AutomodReplaceParseResult,
    released: ChatMessage | undefined,
    videoId: string,
    source: AutomodMessageSource = 'live'
  ): boolean {
    if (parsed.kind === 'hide') {
      const cardId = this.resolveHeldId(parsed.targetItemId)
      if (cardId) {
        this.finishAction(cardId, AUTOMOD_HIDE_ICON, videoId, undefined, source)
        if (parsed.replacementId && parsed.replacementId !== cardId) {
          this.dismiss(parsed.replacementId)
        }
        return true
      }
      this.dismiss(parsed.targetItemId)
      if (parsed.replacementId) this.dismiss(parsed.replacementId)
      return true
    }

    const cardId = this.resolveHeldId(parsed.targetItemId)
    if (!cardId) return false

    if (parsed.kind !== 'show' || !released) return false

    const heldEntry = this.takeHeld(cardId)
    if (!heldEntry) return false
    const resolvedVideoId = heldEntry.videoId || videoId
    const realId = parsed.replacementId || released.id || cardId
    const text = parsed.text ?? released.text
    const releasedMessage: ChatMessage = {
      ...released,
      id: realId,
      authorName: parsed.authorName || released.authorName,
      authorChannelId: parsed.authorChannelId || released.authorChannelId,
      text,
      parts: [{ type: 'text', text }],
      timestamp: parsed.timestamp ?? released.timestamp,
      replacesId: cardId,
      heldForReview: false,
      heldHeader: undefined,
      heldActions: undefined,
      removed: false,
      pending: false
    }
    const hasMenu = this.context?.storeModeratableItem?.(
      realId,
      realId !== cardId ? cardId : undefined,
      parsed.rawReplacement,
      releasedMessage
    ) ?? false
    releasedMessage.hasContextMenu = hasMenu || !!releasedMessage.hasContextMenu
    this.context?.deleteEndpointCache?.(cardId, resolvedVideoId)
    this.rememberRelease(cardId, releasedMessage.text, releasedMessage.authorChannelId)
    if (realId !== cardId) {
      this.rememberRelease(realId, releasedMessage.text, releasedMessage.authorChannelId)
    }
    this.context?.emitMessage?.(releasedMessage, resolvedVideoId, source)
    if (!releasedMessage.hasContextMenu) {
      this.context?.recoverMenu?.(
        realId,
        releasedMessage.text,
        resolvedVideoId,
        source
      )
    }
    return true
  }

  finishAction(
    messageId: string,
    iconType: string,
    videoId: string,
    moderateData?: unknown,
    source: AutomodMessageSource = 'live'
  ): void {
    const resolvedHeldId = this.resolveHeldId(messageId)
    const heldEntry = this.takeHeld(messageId)
    const cardId = resolvedHeldId || messageId
    const resolvedVideoId =
      heldEntry?.videoId ||
      videoId ||
      this.context?.activeVideoId?.() ||
      ''
    this.context?.deleteEndpointCache?.(cardId, resolvedVideoId)

    if (iconType === AUTOMOD_SHOW_ICON) {
      const base = heldEntry?.msg || {
        id: messageId,
        authorName: 'Alguem',
        text: '',
        timestamp: this.now()
      }
      const fromResponse =
        extractReleasedChatItemFromModerateResponse(moderateData)
      if (fromResponse) {
        const released: ChatMessage = {
          id: fromResponse.id,
          authorName: fromResponse.authorName || base.authorName,
          authorChannelId:
            fromResponse.authorChannelId || base.authorChannelId,
          text: fromResponse.text || base.text,
          parts: [{ type: 'text', text: fromResponse.text || base.text }],
          timestamp: fromResponse.timestamp || base.timestamp,
          replacesId: cardId,
          heldForReview: false,
          heldHeader: undefined,
          heldActions: undefined,
          hasContextMenu: false,
          removed: false,
          pending: false
        }
        const hasMenu = this.context?.storeModeratableItem?.(
          fromResponse.id,
          cardId,
          fromResponse.rawItem,
          released
        ) ?? false
        released.hasContextMenu = hasMenu
        this.rememberRelease(
          messageId,
          released.text,
          released.authorChannelId
        )
        if (fromResponse.id !== messageId) {
          this.rememberRelease(
            fromResponse.id,
            released.text,
            released.authorChannelId
          )
        }
        this.context?.emitMessage?.(released, resolvedVideoId, source)
        if (!hasMenu) {
        this.context?.recoverMenu?.(
            fromResponse.id,
            released.text,
            resolvedVideoId,
            source
          )
        }
        return
      }

      const released: ChatMessage = {
        ...base,
        id: cardId,
        heldForReview: false,
        heldHeader: undefined,
        heldActions: undefined,
        hasContextMenu: false,
        removed: false,
        pending: false
      }
      this.rememberRelease(
        messageId,
        released.text,
        released.authorChannelId
      )
      this.context?.deleteItem?.(cardId, resolvedVideoId)
      this.context?.emitMessage?.(released, resolvedVideoId, source)
      this.context?.recoverMenu?.(
        cardId,
        released.text,
        resolvedVideoId,
        source
      )
      return
    }

    this.context?.deleteItem?.(cardId, resolvedVideoId)
    this.dismiss(cardId)
    this.removeRelease(cardId)
    const fallbackVideoId =
      resolvedVideoId || this.context?.activeVideoId?.() || undefined
    this.context?.emitRemoved?.({
      messageId: cardId,
      videoId: fallbackVideoId,
      heldDismissed: true
    })
  }

  dismissAfterModeration(
    messageId: string,
    videoId: string,
    kind: string,
    isHeld: boolean
  ): void {
    if (!isHeld || (kind !== 'timeout' && kind !== 'hide')) return
    const heldEntry = this.takeHeld(messageId)
    const resolvedVideoId =
      heldEntry?.videoId ||
      videoId ||
      this.context?.activeVideoId?.() ||
      ''
    this.dismiss(messageId)
    this.removeRelease(messageId)
    this.context?.emitRemoved?.({
      messageId,
      videoId: resolvedVideoId || undefined,
      heldDismissed: true
    })
  }

  clear(): void {
    this.held.clear()
    this.innerToHeld.clear()
    this.dismissed.clear()
    this.released = []
  }

  hold(msg: ChatMessage, videoId: string, innerId?: string): void {
    const previous = this.held.get(msg.id)
    if (previous?.innerId && previous.innerId !== innerId) {
      this.innerToHeld.delete(previous.innerId)
    }
    this.held.set(msg.id, { msg, videoId, innerId })
    if (innerId) this.innerToHeld.set(innerId, msg.id)
  }

  peekHeld(messageId: string): HeldAutomodMessage | undefined {
    const resolvedId = this.resolveHeldId(messageId)
    return resolvedId ? this.held.get(resolvedId) : undefined
  }

  heldText(messageId: string): string | undefined {
    return this.peekHeld(messageId)?.msg.text
  }

  heldEntries(): Map<string, HeldAutomodMessage> {
    return this.held
  }

  takeHeld(messageId: string): HeldAutomodMessage | undefined {
    const resolvedId = this.resolveHeldId(messageId)
    if (!resolvedId) return undefined
    const entry = this.held.get(resolvedId)
    this.held.delete(resolvedId)
    if (entry?.innerId) this.innerToHeld.delete(entry.innerId)
    for (const [innerId, heldId] of this.innerToHeld) {
      if (heldId === resolvedId) this.innerToHeld.delete(innerId)
    }
    return entry
  }

  resolveHeldId(messageId: string | undefined): string | undefined {
    if (!messageId) return undefined
    if (this.held.has(messageId)) return messageId
    const heldId = this.innerToHeld.get(messageId)
    if (heldId && this.held.has(heldId)) return heldId
    if (heldId) this.innerToHeld.delete(messageId)
    return undefined
  }

  dismiss(messageId: string): void {
    if (!messageId) return
    const now = this.now()
    this.dismissed.set(messageId, now)
    if (this.dismissed.size <= AutomodService.DISMISSED_MAX) return

    for (const [id, at] of this.dismissed) {
      if (now - at > AutomodService.DISMISSED_TTL_MS) this.dismissed.delete(id)
    }
    while (this.dismissed.size > AutomodService.DISMISSED_MAX) {
      const first = this.dismissed.keys().next().value
      if (!first) break
      this.dismissed.delete(first)
    }
  }

  isDismissed(messageId: string | undefined): boolean {
    if (!messageId) return false
    const at = this.dismissed.get(messageId)
    if (at == null) return false
    if (this.now() - at > AutomodService.DISMISSED_TTL_MS) {
      this.dismissed.delete(messageId)
      return false
    }
    return true
  }

  rememberRelease(
    localId: string,
    text: string,
    authorChannelId?: string
  ): void {
    this.pruneReleased()
    this.released.push({ localId, text, authorChannelId, at: this.now() })
    this.released = this.released.slice(-AutomodService.RELEASED_MAX)
  }

  consumeRelease(msg: Pick<ChatMessage, 'id' | 'text' | 'authorChannelId'>): ReleasedAutomodMessage | undefined {
    this.pruneReleased()
    let index = this.released.findIndex((entry) => entry.localId === msg.id)
    if (index < 0 && msg.text && msg.authorChannelId) {
      index = this.released.findIndex(
        (entry) =>
          entry.text === msg.text &&
          !!entry.authorChannelId &&
          entry.authorChannelId === msg.authorChannelId
      )
    }
    if (index < 0) return undefined
    return this.released.splice(index, 1)[0]
  }

  hasRelease(localId: string): boolean {
    this.pruneReleased()
    return this.released.some((entry) => entry.localId === localId)
  }

  removeRelease(localId: string): void {
    this.released = this.released.filter((entry) => entry.localId !== localId)
  }

  private pruneReleased(): void {
    const now = this.now()
    this.released = this.released
      .filter((entry) => now - entry.at < AutomodService.RELEASED_TTL_MS)
      .slice(-AutomodService.RELEASED_MAX)
  }
}
