import { extractMenuParamsFromItem } from '../moderation/moderation-parser'
import type { ChatMessage } from '../../shared/types'
import type { ChannelSession, StoredChatItem } from './chat-session'
import { messagePartsFrom, plainFromParts, textOf } from './message-parser'

type AuthorRecord = { channelId?: string; name: string; text?: string }

export class MessageStore {
  private static readonly ITEM_STORE_MAX = 300
  private static readonly ITEM_STORE_KEEP = 200
  private static readonly AUTHOR_MAP_MAX = 900
  private static readonly AUTHOR_MAP_KEEP = 500
  private static readonly HELD_MAP_MAX = 60

  private readonly authorByMessageId = new Map<string, AuthorRecord>()

  constructor(private readonly currentSession: () => ChannelSession | null) {}

  rememberAuthor(message: ChatMessage): void {
    if (!message.id || message.systemKind) return
    const previous = this.authorByMessageId.get(message.id)
    const text = (message.text || '').trim() || previous?.text || ''
    this.authorByMessageId.set(message.id, {
      channelId: message.authorChannelId || previous?.channelId,
      name: message.authorName || previous?.name || 'Usuario',
      text
    })
    this.pruneAuthorMap()
  }

  storeItem(messageId: string, item: StoredChatItem, aliasId?: string): void {
    const session = this.currentSession()
    if (!session) return
    session.itemStore.set(messageId, item)
    if (aliasId && aliasId !== messageId) session.itemStore.set(aliasId, item)
    this.pruneItemStore(session)
  }

  getItem(messageId: string): StoredChatItem | undefined {
    return this.currentSession()?.itemStore.get(messageId)
  }

  findAuthor(messageId: string): AuthorRecord | undefined {
    return this.authorByMessageId.get(messageId)
  }

  authorEntries(): IterableIterator<[string, AuthorRecord]> {
    return this.authorByMessageId.entries()
  }

  stats(): { authors: number; items: number } {
    return {
      authors: this.authorByMessageId.size,
      items: this.currentSession()?.itemStore.size || 0
    }
  }

  deletedText(messageId: string): string {
    const cached = this.findAuthor(messageId)?.text?.trim()
    if (cached) return cached
    return this.getItem(messageId)?.text?.trim() || ''
  }

  lightFromRaw(
    rawItem: unknown,
    message?: Pick<
      ChatMessage,
      'authorChannelId' | 'authorName' | 'text' | 'heldForReview'
    >
  ): StoredChatItem {
    const menuParams = extractMenuParamsFromItem(rawItem) || undefined
    let menuApiUrl: string | undefined
    let authorChannelId = message?.authorChannelId
    let authorName = message?.authorName
    let text = message?.text

    if (rawItem && typeof rawItem === 'object') {
      const item = rawItem as {
        author?: { id?: string; name?: unknown }
        authorExternalChannelId?: string
        author_external_channel_id?: string
        authorName?: unknown
        author_name?: unknown
        message?: unknown
        menu_endpoint?: {
          metadata?: { api_url?: string }
          payload?: { params?: string }
        }
      }
      const apiUrl = item.menu_endpoint?.metadata?.api_url
      if (typeof apiUrl === 'string' && apiUrl) {
        menuApiUrl = apiUrl.replace(/^\/youtubei\/v1\//, '')
      }
      if (!authorChannelId) {
        authorChannelId =
          (typeof item.author?.id === 'string' && item.author.id) ||
          (typeof item.authorExternalChannelId === 'string' &&
            item.authorExternalChannelId) ||
          (typeof item.author_external_channel_id === 'string' &&
            item.author_external_channel_id) ||
          undefined
      }
      if (!authorName) {
        authorName =
          textOf(item.author?.name) ||
          textOf(item.authorName) ||
          textOf(item.author_name) ||
          undefined
      }
      if (!text && item.message) {
        try {
          const plain = plainFromParts(messagePartsFrom(item.message)).trim()
          if (plain) text = plain
        } catch {
          // Item parcial do YouTube: mantem os demais metadados.
        }
      }
    }

    return {
      menuParams,
      menuApiUrl: menuParams
        ? menuApiUrl || 'live_chat/get_item_context_menu'
        : undefined,
      authorChannelId,
      authorName: authorName || undefined,
      text: text ? text.slice(0, 400) : undefined,
      isAutomodHeld: !!message?.heldForReview
    }
  }

  lightFromMessage(
    message: ChatMessage,
    isAutomodHeld = false
  ): StoredChatItem {
    return {
      authorChannelId: message.authorChannelId,
      authorName: message.authorName || undefined,
      text: message.text ? message.text.slice(0, 400) : undefined,
      isAutomodHeld: isAutomodHeld || !!message.heldForReview
    }
  }

  pruneHeldMessages<T>(messages: Map<string, T>): void {
    if (messages.size <= MessageStore.HELD_MAP_MAX) return
    const drop = messages.size - Math.floor(MessageStore.HELD_MAP_MAX / 2)
    this.dropOldest(messages, drop)
  }

  private pruneAuthorMap(): void {
    if (this.authorByMessageId.size <= MessageStore.AUTHOR_MAP_MAX) return
    const drop = this.authorByMessageId.size - MessageStore.AUTHOR_MAP_KEEP
    this.dropOldest(this.authorByMessageId, drop)
  }

  private pruneItemStore(session: ChannelSession): void {
    if (session.itemStore.size <= MessageStore.ITEM_STORE_MAX) return
    const drop = session.itemStore.size - MessageStore.ITEM_STORE_KEEP
    let index = 0
    for (const key of session.itemStore.keys()) {
      if (index++ >= drop) break
      session.itemStore.delete(key)
      session.modMenuCache.delete(key)
      session.modEndpointCache.delete(key)
    }
  }

  private dropOldest<T>(map: Map<string, T>, count: number): void {
    let index = 0
    for (const key of map.keys()) {
      if (index++ >= count) break
      map.delete(key)
    }
  }
}
