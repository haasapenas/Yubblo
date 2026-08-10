/**
 * Persistência das abas e canais no processo principal.
 * A lista fica em userData/channels.json, sobrevive a reinicializações e não
 * depende do estado do renderer.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface SavedChannel {
  /** Chave estável: h:@handle | v:videoId | i:input */
  key: string
  /** Texto usado para reabrir (preferir @handle / link de canal) */
  input: string
  channelName: string
  channelHandle?: string
  lastVideoId?: string
  title?: string
  order: number
}

export interface ChannelsFile {
  version: 1
  channels: SavedChannel[]
  /** key do canal ativo por último */
  activeKey: string | null
}

const FILE_NAME = 'channels.json'

function filePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE_NAME)
}

function empty(): ChannelsFile {
  return { version: 1, channels: [], activeKey: null }
}

export function loadChannels(): ChannelsFile {
  const path = filePath()
  if (!existsSync(path)) return empty()
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<ChannelsFile>
    if (!Array.isArray(parsed.channels)) return empty()
    return {
      version: 1,
      channels: parsed.channels
        .filter((c) => c && typeof c.input === 'string' && c.input.trim())
        .map((c, i) => ({
          key: typeof c.key === 'string' && c.key ? c.key : `i:${c.input}`,
          input: String(c.input).trim(),
          channelName: String(c.channelName || c.input || 'Canal'),
          channelHandle: c.channelHandle ? String(c.channelHandle) : undefined,
          lastVideoId: c.lastVideoId ? String(c.lastVideoId) : undefined,
          title: c.title ? String(c.title) : undefined,
          order: typeof c.order === 'number' ? c.order : i
        }))
        .sort((a, b) => a.order - b.order),
      activeKey: parsed.activeKey ?? null
    }
  } catch (e) {
    console.warn('[channels-store] load failed', e)
    return empty()
  }
}

export function saveChannels(data: ChannelsFile): void {
  try {
    const normalized: ChannelsFile = {
      version: 1,
      activeKey: data.activeKey ?? null,
      channels: data.channels.map((c, i) => ({
        ...c,
        order: i
      }))
    }
    writeFileSync(filePath(), JSON.stringify(normalized, null, 2), 'utf8')
  } catch (e) {
    console.warn('[channels-store] save failed', e)
  }
}

/** Placeholder de aba antes de o chat conectar. */
export const PENDING_TAB_PREFIX = 'pending:'

export function pendingTabId(tabKey: string): string {
  return `${PENDING_TAB_PREFIX}${tabKey}`
}

export function isPendingTabId(videoId: string | null | undefined): boolean {
  return typeof videoId === 'string' && videoId.startsWith(PENDING_TAB_PREFIX)
}

export function tabKeyFromPendingId(videoId: string): string | null {
  if (!isPendingTabId(videoId)) return null
  return videoId.slice(PENDING_TAB_PREFIX.length)
}

export function makeChannelKey(opts: {
  channelHandle?: string
  channelName?: string
  input?: string
  videoId?: string
  tabKey?: string
}): string {
  if (opts.tabKey) return opts.tabKey

  if (opts.videoId && isPendingTabId(opts.videoId)) {
    return tabKeyFromPendingId(opts.videoId) || opts.videoId
  }

  const handle = opts.channelHandle?.replace(/^@/, '').trim().toLowerCase()
  if (handle) return `h:${handle}`

  const input = (opts.input || '').trim()
  if (input) {
    const m = input.match(/(?:youtube\.com\/@|@)([a-zA-Z0-9._-]+)/i)
    if (m?.[1]) return `h:${m[1].toLowerCase()}`
    const ch = input.match(/youtube\.com\/channel\/(UC[\w-]+)/i)
    if (ch?.[1]) return `c:${ch[1]}`
    if (/^UC[\w-]{20,}$/.test(input)) return `c:${input}`
    if (/^[a-zA-Z0-9._-]+$/.test(input) && !/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return `h:${input.replace(/^@/, '').toLowerCase()}`
    }
  }

  if (opts.videoId && !isPendingTabId(opts.videoId)) return `v:${opts.videoId}`
  if (input) return `i:${input.toLowerCase()}`
  return `i:unknown`
}

/** Executa tarefas com paralelismo limitado (join de canais em pool) */
export async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (!items.length) return
  const limit = Math.max(1, Math.min(concurrency, items.length))
  let next = 0
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++
      await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: limit }, () => run()))
}

export function upsertSavedChannel(
  file: ChannelsFile,
  channel: Omit<SavedChannel, 'order'> & { order?: number },
  makeActive = true
): ChannelsFile {
  const channels = [...file.channels]
  const idx = channels.findIndex((c) => c.key === channel.key)
  const entry: SavedChannel = {
    key: channel.key,
    input: channel.input,
    channelName: channel.channelName,
    channelHandle: channel.channelHandle,
    lastVideoId: channel.lastVideoId,
    title: channel.title,
    order: idx >= 0 ? channels[idx].order : channels.length
  }
  if (idx >= 0) {
    // Mantém input “estável” se o novo for só videoId e o antigo era @handle
    const prev = channels[idx]
    const newIsVideoOnly =
      /^[a-zA-Z0-9_-]{11}$/.test(entry.input) || entry.input.includes('watch?v=')
    const prevIsStable =
      prev.input.includes('@') ||
      prev.input.includes('/channel/') ||
      prev.key.startsWith('h:') ||
      prev.key.startsWith('c:')
    if (newIsVideoOnly && prevIsStable) {
      entry.input = prev.input
    }
    channels[idx] = { ...prev, ...entry, order: prev.order }
  } else {
    channels.push(entry)
  }
  channels.sort((a, b) => a.order - b.order)
  return {
    version: 1,
    channels: channels.map((c, i) => ({ ...c, order: i })),
    activeKey: makeActive ? channel.key : file.activeKey
  }
}

export function removeSavedChannel(
  file: ChannelsFile,
  match: { key?: string; videoId?: string }
): ChannelsFile {
  const channels = file.channels.filter((c) => {
    if (match.key && c.key === match.key) return false
    if (match.videoId && c.lastVideoId === match.videoId) return false
    return true
  })
  let activeKey = file.activeKey
  if (activeKey && !channels.some((c) => c.key === activeKey)) {
    activeKey = channels[0]?.key ?? null
  }
  return {
    version: 1,
    channels: channels.map((c, i) => ({ ...c, order: i })),
    activeKey
  }
}
