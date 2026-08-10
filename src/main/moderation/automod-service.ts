import type { ChatMessage } from '../../shared/types'
import {
  AUTOMOD_SHOW_ICON,
  extractReleasedChatItemFromModerateResponse,
  type AutomodHeldParseResult
} from './automod-parser'
import type { RawModEndpoint } from './moderation-parser'

export interface AutomodContext {
  cacheEndpoints?(
    messageId: string,
    endpoints: RawModEndpoint[],
    videoId: string
  ): void
  storeHeldSnapshot?(message: ChatMessage, videoId: string): void
  emitMessage?(message: ChatMessage, videoId: string): void
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
    rawItem?: unknown
  ): boolean
  deleteItem?(messageId: string, videoId: string): void
  recoverMenu?(messageId: string, text: string, videoId: string): void
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
      this.hold(message, videoId)
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
    rawItem?: unknown
  ): boolean {
    if (this.isDismissed(message.id)) return true
    const released = this.consumeRelease(message)
    if (!released) {
      return this.context?.upgradeReleasedMenu?.(
        message,
        videoId,
        rawItem
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
      videoId
    )
    return true
  }

  finishAction(
    messageId: string,
    iconType: string,
    videoId: string,
    moderateData?: unknown
  ): void {
    const heldEntry = this.takeHeld(messageId)
    const resolvedVideoId =
      heldEntry?.videoId ||
      videoId ||
      this.context?.activeVideoId?.() ||
      ''
    this.context?.deleteEndpointCache?.(messageId, resolvedVideoId)

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
          replacesId: messageId,
          heldForReview: false,
          heldHeader: undefined,
          heldActions: undefined,
          hasContextMenu: false,
          removed: false,
          pending: false
        }
        const hasMenu = this.context?.storeModeratableItem?.(
          fromResponse.id,
          messageId,
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
        this.context?.emitMessage?.(released, resolvedVideoId)
        if (!hasMenu) {
          this.context?.recoverMenu?.(
            fromResponse.id,
            released.text,
            resolvedVideoId
          )
        }
        return
      }

      const released: ChatMessage = {
        ...base,
        id: messageId,
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
      this.context?.deleteItem?.(messageId, resolvedVideoId)
      this.context?.emitMessage?.(released, resolvedVideoId)
      this.context?.recoverMenu?.(
        messageId,
        released.text,
        resolvedVideoId
      )
      return
    }

    this.context?.deleteItem?.(messageId, resolvedVideoId)
    this.dismiss(messageId)
    this.removeRelease(messageId)
    const fallbackVideoId =
      resolvedVideoId || this.context?.activeVideoId?.() || undefined
    this.context?.emitRemoved?.({
      messageId,
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
    this.dismissed.clear()
    this.released = []
  }

  hold(msg: ChatMessage, videoId: string): void {
    this.held.set(msg.id, { msg, videoId })
  }

  peekHeld(messageId: string): HeldAutomodMessage | undefined {
    return this.held.get(messageId)
  }

  heldText(messageId: string): string | undefined {
    return this.held.get(messageId)?.msg.text
  }

  heldEntries(): Map<string, HeldAutomodMessage> {
    return this.held
  }

  takeHeld(messageId: string): HeldAutomodMessage | undefined {
    const entry = this.held.get(messageId)
    this.held.delete(messageId)
    return entry
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
