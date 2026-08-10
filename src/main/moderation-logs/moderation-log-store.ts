/**
 * Escrita JSONL por transmissão com fila serial por stream.
 * Transmissões diferentes escrevem em paralelo.
 */
import { appendFile, mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type {
  ModerationLogEntry,
  ModerationLogStreamMeta
} from '../../shared/contracts/moderation-logs'
import {
  formatLocalDate,
  makeStreamKey,
  resolveInsideLogs,
  resolveStreamDir,
  streamFolderName
} from './moderation-log-paths'

export interface StreamContext {
  channelId: string
  channelName: string
  channelHandle?: string
  videoId: string
  title: string
}

export class ModerationLogStore {
  private readonly queues = new Map<string, Promise<void>>()
  private readonly videoToKey = new Map<string, string>()

  resolveOrCreateStreamKey(ctx: StreamContext, at = new Date()): string {
    const channelId = sanitizeChannelId(ctx.channelId)
    const cacheKey = makeVideoCacheKey(channelId, ctx.videoId)
    const existing = this.videoToKey.get(cacheKey)
    if (existing) return existing
    const persisted = findPersistedStreamKey(channelId, ctx.videoId)
    if (persisted) {
      this.videoToKey.set(cacheKey, persisted)
      return persisted
    }
    const date = formatLocalDate(at)
    const folder = streamFolderName(date, ctx.videoId, ctx.title)
    const key = makeStreamKey(channelId, folder)
    this.videoToKey.set(cacheKey, key)
    return key
  }

  forgetVideo(videoId: string): void {
    for (const key of this.videoToKey.keys()) {
      if (key.endsWith(`\u0000${videoId}`)) this.videoToKey.delete(key)
    }
  }

  forgetStreamKey(streamKey: string): void {
    for (const [vid, key] of this.videoToKey) {
      if (key === streamKey) this.videoToKey.delete(vid)
    }
  }

  enqueueAppend(
    streamKey: string,
    meta: StreamContext,
    entry: ModerationLogEntry
  ): Promise<void> {
    const prev = this.queues.get(streamKey) || Promise.resolve()
    const next = prev
      .catch(() => undefined)
      .then(() => this.writeAppend(streamKey, meta, entry))
    this.queues.set(
      streamKey,
      next.catch((error) => {
        console.warn('[mod-logs] write failed', streamKey, error)
        throw error
      })
    )
    return next
  }

  private async writeAppend(
    streamKey: string,
    meta: StreamContext,
    entry: ModerationLogEntry
  ): Promise<void> {
    const dir = resolveStreamDir(streamKey)
    if (!dir) throw new Error('Invalid stream key for write')
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    const metaPath = join(dir, 'metadata.json')
    if (!existsSync(metaPath)) {
      const payload: ModerationLogStreamMeta = {
        channelId: sanitizeChannelId(meta.channelId),
        channelName: meta.channelName || '',
        channelHandle: meta.channelHandle,
        videoId: meta.videoId,
        title: meta.title || '',
        createdAt: new Date().toISOString()
      }
      await writeFile(metaPath, JSON.stringify(payload, null, 2), 'utf8')
    }
    const line = `${JSON.stringify(entry)}\n`
    await appendFile(join(dir, 'moderation.jsonl'), line, 'utf8')
  }

  async readMeta(streamKey: string): Promise<ModerationLogStreamMeta | null> {
    const dir = resolveStreamDir(streamKey)
    if (!dir) return null
    const metaPath = join(dir, 'metadata.json')
    if (!existsSync(metaPath)) return null
    try {
      const raw = await readFile(metaPath, 'utf8')
      return JSON.parse(raw) as ModerationLogStreamMeta
    } catch {
      return null
    }
  }
}

function sanitizeChannelId(raw: string): string {
  const id = String(raw || '').trim()
  return id || 'unknown'
}

function makeVideoCacheKey(channelId: string, videoId: string): string {
  return `${channelId}\u0000${videoId}`
}

function findPersistedStreamKey(
  channelId: string,
  videoId: string
): string | null {
  const channelDir = resolveInsideLogs(channelId)
  if (!channelDir || !existsSync(channelDir)) return null
  const matches: Array<{ key: string; createdAt: string }> = []
  for (const folder of readdirSync(channelDir)) {
    const streamDir = join(channelDir, folder)
    try {
      if (!statSync(streamDir).isDirectory()) continue
      const metaPath = join(streamDir, 'metadata.json')
      if (!existsSync(metaPath)) continue
      const meta = JSON.parse(
        readFileSync(metaPath, 'utf8')
      ) as Partial<ModerationLogStreamMeta>
      if (meta.videoId !== videoId) continue
      matches.push({
        key: makeStreamKey(channelId, folder),
        createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : ''
      })
    } catch {
      // Ignora diretórios ou metadados inválidos e cria um registro novo.
    }
  }
  matches.sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.key.localeCompare(b.key)
  )
  return matches[0]?.key || null
}
