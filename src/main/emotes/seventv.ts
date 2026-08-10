/**
 * Integração de emotes 7TV para chats do YouTube.
 *
 * YouTube (API quirk):
 *   GET https://7tv.io/v3/users/google/{youtubeChannelId UC...}
 *   (path "google", campo platform retorna "YOUTUBE")
 *   GraphQL v3: userByConnection(platform: YOUTUBE, id: "UC...")
 *
 * Identificação no chat: emotes 7TV chegam como TEXTO puro no YouTube
 * (não como EmojiRun). Tokens separados por espaço iguais a emote.name
 * são convertidos em imagens pelo renderizador do chat.
 */

import type { ChatPart } from '../../shared/types'

const STV_BASE = 'https://7tv.io/v3'
const GLOBAL_SET = 'global'
/** Path REST para canal YouTube (não "youtube" — API rejeita) */
const YT_PLATFORM_PATH = 'google'

/** Flag ActiveEmote usada para identificar emotes zero-width. */
const FLAG_ZERO_WIDTH = 1 << 0

export interface StvEmote {
  id: string
  name: string
  /** URL https do 2x.webp (preferido) */
  url: string
  zeroWidth: boolean
  isGlobal: boolean
  baseName?: string
}

export type StvEmoteMap = Map<string, StvEmote>

interface StvHostFile {
  name?: string
  static_name?: string
  width?: number
  height?: number
  format?: string
}

interface StvActiveEmote {
  id?: string
  name?: string
  flags?: number
  data?: {
    id?: string
    name?: string
    listed?: boolean
    flags?: number
    host?: {
      url?: string
      files?: StvHostFile[]
    }
  }
}

interface StvEmoteSet {
  id?: string
  name?: string
  emotes?: StvActiveEmote[]
}

let globalCache: StvEmoteMap | null = null
let globalLoadPromise: Promise<StvEmoteMap> | null = null

function normalizeHostUrl(hostUrl: string): string {
  if (!hostUrl) return ''
  if (hostUrl.startsWith('//')) return `https:${hostUrl}`
  if (hostUrl.startsWith('http://')) return `https://${hostUrl.slice(7)}`
  return hostUrl
}

/** Prefere WEBP 2x → 1x → 3x → 4x. */
function pickEmoteUrl(host: { url?: string; files?: StvHostFile[] } | undefined): string {
  if (!host?.url || !host.files?.length) return ''
  const base = normalizeHostUrl(host.url)
  const webps = host.files.filter((f) => (f.format || '').toUpperCase() === 'WEBP' && f.name)
  const order = ['2x.webp', '1x.webp', '3x.webp', '4x.webp']
  for (const name of order) {
    const f = webps.find((x) => x.name === name)
    if (f?.name) return `${base}/${f.name}`
  }
  if (webps[0]?.name) return `${base}/${webps[0].name}`
  const any = host.files.find((f) => f.name)
  return any?.name ? `${base}/${any.name}` : ''
}

function parseEmoteSet(set: StvEmoteSet | null | undefined, isGlobal: boolean): StvEmoteMap {
  const map: StvEmoteMap = new Map()
  const emotes = set?.emotes
  if (!Array.isArray(emotes)) return map

  for (const active of emotes) {
    const data = active?.data
    if (!data) continue
    // Emotes não listados não são exibidos no seletor.
    if (data.listed === false) continue
    const name = active.name || data.name
    if (!name) continue
    const url = pickEmoteUrl(data.host)
    if (!url) continue
    const zeroWidth = ((active.flags || 0) & FLAG_ZERO_WIDTH) !== 0
    map.set(name, {
      id: active.id || data.id || name,
      name,
      url,
      zeroWidth,
      isGlobal,
      baseName: data.name && data.name !== name ? data.name : undefined
    })
  }
  return map
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Yubblo/0.1 (7TV)'
      }
    })
    if (!res.ok) {
      console.warn('[7tv]', res.status, url)
      return null
    }
    return (await res.json()) as unknown
  } catch (e) {
    console.warn('[7tv] fetch failed', url, e)
    return null
  }
}

/** Emotes globais mantidos em cache durante o processo. */
export async function loadGlobalEmotes(force = false): Promise<StvEmoteMap> {
  if (!force && globalCache) return globalCache
  if (!force && globalLoadPromise) return globalLoadPromise

  globalLoadPromise = (async () => {
    const json = (await fetchJson(`${STV_BASE}/emote-sets/${GLOBAL_SET}`)) as StvEmoteSet | null
    const map = parseEmoteSet(json || undefined, true)
    globalCache = map
    console.log(`[7tv] globais: ${map.size} emotes`)
    return map
  })()

  try {
    return await globalLoadPromise
  } finally {
    globalLoadPromise = null
  }
}

/**
 * Emotes do canal YouTube + globais (canal sobrescreve global no mesmo nome).
 * REST: /v3/users/google/{UC...}  (path "google")
 */
export async function loadChannelEmotes(youtubeChannelId: string): Promise<{
  map: StvEmoteMap
  setId?: string
  setName?: string
  count: number
}> {
  const channelId = youtubeChannelId.trim()
  if (!channelId.startsWith('UC')) {
    const global = await loadGlobalEmotes()
    return { map: new Map(global), count: 0 }
  }

  const [global, userJson] = await Promise.all([
    loadGlobalEmotes(),
    fetchJson(`${STV_BASE}/users/${YT_PLATFORM_PATH}/${encodeURIComponent(channelId)}`)
  ])

  const map = new Map(global)
  let setId: string | undefined
  let setName: string | undefined
  let count = 0

  if (userJson && typeof userJson === 'object') {
    const u = userJson as {
      emote_set?: StvEmoteSet
      emote_set_id?: string
    }
    const set = u.emote_set
    if (set?.emotes?.length) {
      const channelMap = parseEmoteSet(set, false)
      count = channelMap.size
      setId = set.id || u.emote_set_id
      setName = set.name
      for (const [name, em] of channelMap) {
        map.set(name, em) // canal sobrescreve global
      }
      console.log(
        `[7tv] canal ${channelId}: ${count} emotes (set ${setName || setId || '?'}) + ${global.size} globais → ${map.size} total`
      )
    } else {
      console.log(`[7tv] canal ${channelId}: sem emote_set (só globais)`)
    }
  } else {
    console.log(`[7tv] canal ${channelId}: sem perfil 7TV (só globais)`)
  }

  return { map, setId, setName, count }
}

function mergeTextParts(parts: ChatPart[]): ChatPart[] {
  const out: ChatPart[] = []
  for (const p of parts) {
    const last = out[out.length - 1]
    if (p.type === 'text' && last?.type === 'text') {
      last.text += p.text
    } else {
      out.push(p.type === 'text' ? { type: 'text', text: p.text } : { ...p })
    }
  }
  return out
}

/** Converte tokens cujo texto corresponde ao nome de um emote e mantém os espaços. */
export function tokenizeTextWithSeventv(text: string, map: StvEmoteMap | null | undefined): ChatPart[] {
  if (!text) return []
  if (!map?.size) return [{ type: 'text', text }]

  const tokens = text.split(/(\s+)/)
  const parts: ChatPart[] = []

  for (const tok of tokens) {
    if (!tok) continue
    if (/^\s+$/.test(tok)) {
      parts.push({ type: 'text', text: tok })
      continue
    }
    const em = map.get(tok)
    if (em) {
      parts.push({
        type: 'emoji',
        text: em.name,
        url: em.url,
        isCustom: true,
        emojiId: em.id,
        zeroWidth: em.zeroWidth,
        provider: '7tv'
      })
    } else {
      parts.push({ type: 'text', text: tok })
    }
  }

  return mergeTextParts(parts)
}

/** Aplica 7TV só nos runs de texto; EmojiRun do YouTube permanecem */
export function applySeventvToParts(
  parts: ChatPart[] | undefined,
  plainText: string,
  map: StvEmoteMap | null | undefined
): ChatPart[] | undefined {
  if (!map?.size) return parts

  if (!parts?.length) {
    const t = tokenizeTextWithSeventv(plainText, map)
    return t.length ? t : undefined
  }

  const out: ChatPart[] = []
  for (const p of parts) {
    if (p.type === 'emoji') {
      out.push(p)
    } else {
      out.push(...tokenizeTextWithSeventv(p.text, map))
    }
  }
  return mergeTextParts(out)
}
