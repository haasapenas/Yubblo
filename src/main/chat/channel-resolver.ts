import type { Innertube } from 'youtubei.js'
import type {
  AppError,
  ListChannelLivesResult,
  LiveStreamOption
} from '../../shared/types'
import { mapPool } from './channels-store'
import {
  isVideoLiveNow,
  liveOptionFromNode,
  looksLive,
  looksUpcoming
} from './channel-parser'
import { textOf } from './message-parser'

export type ParsedChannelInput = {
  kind: 'video' | 'handle' | 'channelId'
  value: string
}

export function parseChannelInput(input: string): ParsedChannelInput {
  const raw = input.trim()
  if (!raw) {
    throw channelError(
      'CHANNEL_NOT_FOUND',
      'Informe o nome do canal ou o link da live.'
    )
  }

  const videoPatterns = [
    /(?:youtube[.]com[/](?:watch[?](?:[^#]*&)?v=|live[/]|shorts[/]|embed[/]|v[/])|youtu[.]be[/]|youtube[.]com[/]live[?])([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu[.]be[/]([a-zA-Z0-9_-]{11})/
  ]
  for (const pattern of videoPatterns) {
    const match = raw.match(pattern)
    if (match?.[1]) return { kind: 'video', value: match[1] }
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return { kind: 'video', value: raw }
  }

  const channelIdMatch = raw.match(
    /youtube[.]com[/]channel[/](UC[\w-]{20,})/i
  )
  if (channelIdMatch) {
    return { kind: 'channelId', value: channelIdMatch[1] }
  }
  if (/^UC[\w-]{20,}$/.test(raw)) {
    return { kind: 'channelId', value: raw }
  }

  const handleFromUrl = raw.match(/youtube[.]com[/]@([^/?\s]+)/)
  if (handleFromUrl) {
    return {
      kind: 'handle',
      value: decodeURIComponent(handleFromUrl[1])
    }
  }
  return {
    kind: 'handle',
    value: raw.replace(/^@/, '').replace(/\s+/g, '')
  }
}

export interface ChannelResolverDeps {
  yt(): Innertube | null
  isLoggedIn(): boolean
}

export class ChannelResolver {
  private readonly livesListCache = new Map<
    string,
    { at: number; lives: LiveStreamOption[]; channelLabel?: string }
  >()
  private static readonly LIVES_LIST_CACHE_MS = 25_000

  constructor(private readonly deps: ChannelResolverDeps) {}

  async resolveBrowseId(handleOrId: string, isChannelId: boolean): Promise<string> {
    if (isChannelId) return handleOrId
    const yt = this.ensureYt()
    const url = `https://www.youtube.com/@${handleOrId}`
    try {
      const endpoint = await yt.resolveURL(url)
      const browseId = (endpoint.payload as { browseId?: string } | undefined)?.browseId
      if (browseId?.startsWith('UC')) return browseId
    } catch (e) {
      console.warn('[chat-service] resolveURL channel failed', e)
    }
    try {
      const channel = await yt.getChannel(`@${handleOrId}`)
      const ext = channel.metadata?.external_id
      if (ext?.startsWith('UC')) return ext
    } catch (e) {
      console.warn('[chat-service] getChannel by handle failed', e)
    }
    throw this.err('CHANNEL_NOT_FOUND', `Canal @${handleOrId} não encontrado.`)
  }

  /** Cache curto da listagem de lives (evita 2× pesquisa ao abrir + status bar) */
  async listLivesForChannel(
    handleOrId: string,
    isChannelId: boolean
  ): Promise<LiveStreamOption[]> {
    const cacheKey = `${isChannelId ? 'c' : 'h'}:${handleOrId.toLowerCase()}`
    const cached = this.livesListCache.get(cacheKey)
    if (
      cached &&
      Date.now() - cached.at < ChannelResolver.LIVES_LIST_CACHE_MS
    ) {
      console.log(
        `[chat-service] listLives cache hit ${cacheKey} n=${cached.lives.length}`
      )
      return cached.lives
    }

    const yt = this.ensureYt()
    const byId = new Map<string, LiveStreamOption>()

    const push = (opt: LiveStreamOption | null | undefined) => {
      if (!opt?.videoId) return
      const prev = byId.get(opt.videoId)
      if (!prev) {
        byId.set(opt.videoId, opt)
        return
      }
      byId.set(opt.videoId, {
        ...prev,
        ...opt,
        title:
          prev.title === 'Live principal' || prev.title === 'Transmissão'
            ? opt.title || prev.title
            : prev.title || opt.title,
        thumbnailUrl: prev.thumbnailUrl || opt.thumbnailUrl,
        viewerText: prev.viewerText || opt.viewerText,
        isLive: !!(prev.isLive || opt.isLive)
      })
    }

    // 1) /live → principal (1 RTT)
    let primaryId: string | undefined
    const liveUrl = isChannelId
      ? `https://www.youtube.com/channel/${handleOrId}/live`
      : `https://www.youtube.com/@${handleOrId}/live`
    try {
      const endpoint = await yt.resolveURL(liveUrl)
      const payload = endpoint.payload as { videoId?: string; url?: string }
      primaryId = payload?.videoId
      if (!primaryId) {
        const maybeUrl =
          payload?.url || (endpoint as { metadata?: { url?: string } }).metadata?.url
        if (maybeUrl) {
          const m = String(maybeUrl).match(/(?:v=|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
          if (m) primaryId = m[1]
        }
      }
      if (primaryId) {
        push({
          videoId: primaryId,
          title: 'Live principal',
          isLive: true
        })
      }
    } catch (e) {
      console.warn('[chat-service] resolveURL /live failed', e)
    }

    // 2) Aba Streams — multi-live + badge (sem varrer 50 VODs)
    try {
      const browseId = await this.resolveBrowseId(handleOrId, isChannelId)
      const channel = await yt.getChannel(browseId)
      const channelName =
        textOf((channel.metadata as { title?: unknown } | undefined)?.title) ||
        undefined

      let streamsFeed: Awaited<ReturnType<typeof channel.getLiveStreams>> | null =
        null
      try {
        streamsFeed = await channel.getLiveStreams()
      } catch (e) {
        // Normal: canal sem aba "streams" / "vídeos ao vivo" (muitos canais pequenos
        // ou só com live esporádica). Não é erro fatal — usamos /live + offline tab.
        const msg = (e as Error).message || ''
        if (/tab ["']streams["'] not found/i.test(msg)) {
          console.log(
            `[chat-service] canal sem aba streams (@${handleOrId}) — ok se offline`
          )
        } else {
          console.warn('[chat-service] getLiveStreams failed', msg)
        }
      }

      if (streamsFeed) {
        type FeedLike = {
          videos?: unknown[]
          filters?: string[]
          applyFilter?: (f: string) => Promise<FeedLike>
        }
        let feed: FeedLike = streamsFeed as unknown as FeedLike
        let usedLiveFilter = false
        try {
          const filters = feed.filters || []
          const liveChip = filters.find((f) =>
            /live|ao vivo|en directo|en vivo/i.test(f.trim())
          )
          if (liveChip && typeof feed.applyFilter === 'function') {
            feed = await feed.applyFilter(liveChip)
            usedLiveFilter = true
            console.log(`[chat-service] streams filter "${liveChip}"`)
          }
        } catch {
          /* filtro opcional */
        }

        const page1 = [...(feed.videos || [])]
        const liveLooking = page1.filter((v) => looksLive(v) && !looksUpcoming(v))
        // Multi-live: lives irmãs ficam no TOPO (mesmo sem badge detetável)
        // Com filtro Live do YT, a página já é quase só lives → pega mais itens
        const topN = usedLiveFilter ? 12 : 8
        const topSlice = page1.slice(0, topN).filter((v) => !looksUpcoming(v))

        console.log(
          `[chat-service] streams page1=${page1.length} liveLooking=${liveLooking.length} top=${topSlice.length} filter=${usedLiveFilter}`
        )

        // Badge LIVE primeiro (prioridade na verificação)
        for (const v of liveLooking) {
          const opt = liveOptionFromNode(v, channelName)
          if (opt) push({ ...opt, isLive: true })
        }
        // Topo da lista (outras lives ao vivo sem badge no parser)
        for (const v of topSlice) {
          push(liveOptionFromNode(v, channelName))
        }
      }
    } catch (e) {
      if ((e as AppError).code === 'CHANNEL_NOT_FOUND') throw e
      console.warn('[chat-service] list lives channel failed', e)
    }

    // Candidatos: prioriza isLive; no máx. 10 confirmações (multi-live real é 2–6)
    const options = [...byId.values()]
    const ordered = [
      ...options.filter((o) => o.isLive),
      ...options.filter((o) => !o.isLive)
    ].slice(0, 10)

    if (options.length > 0) {
      console.log(
        `[chat-service] listLives candidates=${options.length} verify=${ordered.length} → ${ordered
          .map((o) => o.videoId)
          .join(', ')}`
      )
    } else {
      console.log(
        `[chat-service] listLives vazio (@${handleOrId}) — sem live pública agora`
      )
    }
    if (ordered.length === 0) return []

    const yt2 = this.ensureYt()
    const verified: LiveStreamOption[] = []
    await mapPool(ordered, 5, async (opt) => {
      try {
        const basic = await yt2.getBasicInfo(opt.videoId)
        const bi = basic.basic_info as {
          is_live?: boolean
          is_upcoming?: boolean
          title?: string
          author?: string
          thumbnail?: Array<{ url?: string }>
        }
        const end = (basic as unknown as { streaming_data?: { end_timestamp?: unknown } }).streaming_data?.end_timestamp
        if (!isVideoLiveNow(bi, end)) return
        verified.push({
          ...opt,
          title: bi.title || opt.title,
          channelName: bi.author || opt.channelName,
          thumbnailUrl: opt.thumbnailUrl || bi.thumbnail?.[0]?.url || undefined,
          isLive: true
        })
      } catch {
        /* sem confirmação = fora */
      }
    })

    // Mantém a principal primeiro se estiver na lista
    if (primaryId) {
      verified.sort((a, b) => {
        if (a.videoId === primaryId) return -1
        if (b.videoId === primaryId) return 1
        return 0
      })
    }

    console.log(
      `[chat-service] listLives verified=${verified.length} → ${verified
        .map((o) => `${o.videoId}:${(o.title || '').slice(0, 30)}`)
        .join(' | ')}`
    )

    this.livesListCache.set(cacheKey, {
      at: Date.now(),
      lives: verified,
      channelLabel: verified[0]?.channelName
    })
    if (this.livesListCache.size > 40) {
      const first = this.livesListCache.keys().next().value
      if (first) this.livesListCache.delete(first)
    }
    return verified
  }

  /** Só a live principal — 1 RTT, p/ open rápido quando não precisamos do picker */
  async getPrimaryLiveVideoId(
    handleOrId: string,
    isChannelId: boolean
  ): Promise<string | null> {
    const yt = this.ensureYt()
    const liveUrl = isChannelId
      ? `https://www.youtube.com/channel/${handleOrId}/live`
      : `https://www.youtube.com/@${handleOrId}/live`
    try {
      const endpoint = await yt.resolveURL(liveUrl)
      const payload = endpoint.payload as { videoId?: string; url?: string }
      if (payload?.videoId) return payload.videoId
      const maybeUrl =
        payload?.url || (endpoint as { metadata?: { url?: string } }).metadata?.url
      if (maybeUrl) {
        const m = String(maybeUrl).match(/(?:v=|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
        if (m) return m[1]
      }
    } catch (e) {
      console.warn('[chat-service] primary /live failed', e)
    }
    return null
  }

  async getVideoIdFromChannel(handleOrId: string, isChannelId: boolean): Promise<string> {
    // Rápido: /live primeiro (sem varrer 50 VODs)
    const primary = await this.getPrimaryLiveVideoId(handleOrId, isChannelId)
    if (primary) {
      try {
        const basic = await this.ensureYt().getBasicInfo(primary)
        const bi = basic.basic_info as { is_live?: boolean; is_upcoming?: boolean }
        const end = (basic as unknown as { streaming_data?: { end_timestamp?: unknown } }).streaming_data?.end_timestamp
        if (isVideoLiveNow(bi, end)) return primary
      } catch {
        /* cai na listagem */
      }
    }
    const lives = await this.listLivesForChannel(handleOrId, isChannelId)
    if (lives.length === 0) {
      throw this.err(
        'NOT_LIVE',
        'Não encontrei uma live ativa nesse canal. Confira o @handle e se a live está pública.'
      )
    }
    return lives[0]!.videoId
  }

  /**
   * Adiciona aba do canal sem live (offline). O live-watch reconecta na mesma aba
   * quando a transmissão começar. Não cria “chat novo” — só placeholder estável.
   */
  async listChannelLives(input: string): Promise<ListChannelLivesResult> {
    const parsed = parseChannelInput(input)
    if (parsed.kind === 'video') {
      return {
        input: input.trim(),
        channelLabel: parsed.value,
        lives: [],
        directVideoId: parsed.value
      }
    }

    const isChannelId = parsed.kind === 'channelId'
    const label = isChannelId ? parsed.value : `@${parsed.value.replace(/^@/, '')}`
    const cacheKey = `${isChannelId ? 'c' : 'h'}:${parsed.value.toLowerCase()}`
    try {
      const lives = await this.listLivesForChannel(parsed.value, isChannelId)
      const cached = this.livesListCache.get(cacheKey)
      return {
        input: input.trim(),
        channelLabel: cached?.channelLabel || lives[0]?.channelName || label,
        lives
      }
    } catch (e) {
      if ((e as AppError).code) throw e
      throw this.err(
        'CHANNEL_NOT_FOUND',
        `Não foi possível listar lives de ${label}.`
      )
    }
  }

  private ensureYt(): Innertube {
    const yt = this.deps.yt()
    if (!yt) {
      throw channelError(
        'NOT_LOGGED_IN',
        'Faca login com o YouTube primeiro.'
      )
    }
    return yt
  }

  private err(
    code: AppError['code'],
    message: string
  ): AppError & Error {
    return channelError(code, message)
  }
}

function channelError(
  code: AppError['code'],
  message: string
): AppError & Error {
  const error = new Error(message) as Error & AppError
  error.code = code
  error.message = message
  error.messageKey = ({
    NOT_LOGGED_IN: 'errors.loginRequired',
    CHANNEL_NOT_FOUND: 'errors.channelNotFound',
    NOT_LIVE: 'errors.notLive',
    CHAT_UNAVAILABLE: 'errors.chatUnavailable',
    SEND_FAILED: 'errors.sendFailed',
    NETWORK_ERROR: 'errors.network',
    AUTH_FAILED: 'errors.authFailed',
    UNKNOWN: 'errors.unknown'
  } as Record<AppError['code'], string>)[code]
  return error
}
