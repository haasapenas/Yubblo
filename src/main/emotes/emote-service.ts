import type { YtLiveEmoji } from '../instant-chat'
import type {
  ChatMessage,
  EmoteCatalog,
  EmoteCatalogItem
} from '../../shared/types'
import type { ChannelSession } from '../chat/chat-session'
import {
  applySeventvToParts,
  loadChannelEmotes,
  loadGlobalEmotes
} from './seventv'

export interface EmoteServiceDeps {
  getSession(videoId: string): ChannelSession | undefined
  emitReady(videoId: string): void
}

export class EmoteService {
  constructor(private readonly deps: EmoteServiceDeps) {}

  applyYoutubeDefaults(videoId: string, emojis: YtLiveEmoji[]): void {
    const session = this.deps.getSession(videoId)
    if (!session || !emojis.length) return
    if (session.youtubeDefaultEmojis.size >= emojis.length) return

    session.youtubeDefaultEmojis.clear()
    for (const emoji of emojis) {
      const name = this.youtubeInsertName(emoji)
      const key = emoji.emojiId || name
      if (!key || !emoji.url) continue
      session.youtubeDefaultEmojis.set(key, {
        id: emoji.emojiId || key,
        name,
        url: emoji.url,
        isCustom: emoji.isCustom
      })
    }
    console.log(
      `[chat-service] emotes YT padrao: ${session.youtubeDefaultEmojis.size} (video=${videoId})`
    )
    this.deps.emitReady(videoId)
  }

  loadSeventv(videoId: string, youtubeChannelId?: string): void {
    void (async () => {
      try {
        await loadGlobalEmotes()
        if (!youtubeChannelId?.startsWith('UC')) {
          const global = await loadGlobalEmotes()
          const session = this.deps.getSession(videoId)
          if (session) session.seventvMap = global
          this.deps.emitReady(videoId)
          return
        }

        const { map, count } = await loadChannelEmotes(youtubeChannelId)
        const session = this.deps.getSession(videoId)
        if (!session) return
        session.seventvMap = map
        session.youtubeChannelId = youtubeChannelId
        console.log(
          `[chat-service] 7TV pronto ${videoId} canalEmotes=${count} total=${map.size}`
        )
        this.deps.emitReady(videoId)
      } catch (error) {
        console.warn('[chat-service] 7TV load failed', videoId, error)
      }
    })()
  }

  catalog(videoId: string | null): EmoteCatalog {
    const empty: EmoteCatalog = {
      videoId,
      stvChannel: [],
      stvGlobal: [],
      youtube: []
    }
    if (!videoId) return empty
    const session = this.deps.getSession(videoId)
    if (!session) return empty

    const stvChannel: EmoteCatalogItem[] = []
    const stvGlobal: EmoteCatalogItem[] = []
    for (const emote of session.seventvMap.values()) {
      const item: EmoteCatalogItem = {
        id: emote.id,
        name: emote.name,
        url: emote.url,
        provider: '7tv',
        scope: emote.isGlobal ? 'global' : 'channel',
        zeroWidth: emote.zeroWidth
      }
      if (emote.isGlobal) stvGlobal.push(item)
      else stvChannel.push(item)
    }
    const byName = (a: EmoteCatalogItem, b: EmoteCatalogItem): number =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    stvChannel.sort(byName)
    stvGlobal.sort(byName)

    const youtube: EmoteCatalogItem[] = [
      ...session.youtubeDefaultEmojis.values()
    ]
      .map((emoji) => ({
        id: emoji.id,
        name: emoji.name,
        url: emoji.url,
        provider: 'youtube' as const,
        scope: emoji.isCustom ? ('channel' as const) : ('global' as const)
      }))
      .sort(byName)

    return {
      videoId,
      channelName: session.info.channelName,
      stvChannel,
      stvGlobal,
      youtube
    }
  }

  apply(message: ChatMessage, videoId: string): ChatMessage {
    const session = this.deps.getSession(videoId)
    if (!session?.seventvMap?.size) return message
    const parts = applySeventvToParts(
      message.parts,
      message.text,
      session.seventvMap
    )
    return parts ? { ...message, parts } : message
  }

  private youtubeInsertName(emoji: YtLiveEmoji): string {
    const shortcuts = emoji.shortcuts || []
    const colon = shortcuts.find(
      (shortcut) => shortcut.startsWith(':') && shortcut.endsWith(':')
    )
    return colon || shortcuts[0] || emoji.emojiId
  }
}
