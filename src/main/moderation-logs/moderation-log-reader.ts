/**
 * Leitura incremental de JSONL (do fim) com filtros e paginação.
 * Não faz JSON.parse do arquivo inteiro de uma vez.
 */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'
import type {
  ModerationLogChannelGroup,
  ModerationLogEntry,
  ModerationLogFilters,
  ModerationLogPage,
  ModerationLogPageRequest,
  ModerationLogStreamMeta,
  ModerationLogStreamSummary
} from '../../shared/contracts/moderation-logs'
import { logsRoot, resolveStreamDir, splitStreamKey } from './moderation-log-paths'
import { parseLogEntryLine } from './moderation-log-normalize'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200
const MAX_QUERY_LEN = 120

export function clampPageRequest(
  req: ModerationLogPageRequest
): Required<Pick<ModerationLogPageRequest, 'offset' | 'limit'>> &
  ModerationLogPageRequest {
  const offset = Math.max(0, Math.floor(Number(req.offset) || 0))
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(Number(req.limit) || DEFAULT_LIMIT))
  )
  const filters = sanitizeFilters(req.filters)
  return {
    streamKey: String(req.streamKey || ''),
    filters,
    offset,
    limit
  }
}

export function sanitizeFilters(
  filters?: ModerationLogFilters
): ModerationLogFilters | undefined {
  if (!filters || typeof filters !== 'object') return undefined
  const actions = Array.isArray(filters.actions)
    ? filters.actions.filter(
        (a): a is 'timeout' | 'deleted' | 'hide' =>
          a === 'timeout' || a === 'deleted' || a === 'hide'
      )
    : undefined
  const query =
    typeof filters.query === 'string'
      ? filters.query.trim().slice(0, MAX_QUERY_LEN)
      : undefined
  const dateFrom =
    typeof filters.dateFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom)
      ? filters.dateFrom
      : undefined
  const dateTo =
    typeof filters.dateTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)
      ? filters.dateTo
      : undefined
  return { actions, query, dateFrom, dateTo }
}

export function entryMatchesFilters(
  entry: ModerationLogEntry,
  filters?: ModerationLogFilters
): boolean {
  if (!filters) return true
  if (filters.actions && filters.actions.length > 0) {
    if (!filters.actions.includes(entry.action)) return false
  }
  if (filters.dateFrom && entry.date < filters.dateFrom) return false
  if (filters.dateTo && entry.date > filters.dateTo) return false
  if (filters.query) {
    const q = filters.query.toLowerCase()
    const hay = `${entry.user} ${entry.moderator}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export class ModerationLogReader {
  async listChannels(): Promise<ModerationLogChannelGroup[]> {
    const root = logsRoot()
    if (!existsSync(root)) return []
    const groups: ModerationLogChannelGroup[] = []
    for (const channelId of readdirSync(root)) {
      const channelPath = join(root, channelId)
      if (!statSync(channelPath).isDirectory()) continue
      if (channelId.includes('..')) continue
      const streams: ModerationLogStreamSummary[] = []
      let channelName = channelId
      for (const folder of readdirSync(channelPath)) {
        const streamPath = join(channelPath, folder)
        if (!statSync(streamPath).isDirectory()) continue
        const key = `${channelId}/${folder}`
        if (!splitStreamKey(key)) continue
        const summary = await this.summarizeStream(key)
        if (summary) {
          streams.push(summary)
          if (summary.channelName) channelName = summary.channelName
        }
      }
      streams.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      if (streams.length > 0) {
        groups.push({ channelId, channelName, streams })
      }
    }
    groups.sort((a, b) =>
      a.channelName.localeCompare(b.channelName, undefined, {
        sensitivity: 'base'
      })
    )
    return groups
  }

  async readPage(request: ModerationLogPageRequest): Promise<ModerationLogPage> {
    const req = clampPageRequest(request)
    const empty: ModerationLogPage = {
      streamKey: req.streamKey,
      entries: [],
      offset: req.offset!,
      limit: req.limit!,
      hasMore: false,
      totalMatched: 0,
      counts: { timeout: 0, deleted: 0, hide: 0, total: 0 },
      meta: null,
      warnings: []
    }
    const dir = resolveStreamDir(req.streamKey)
    if (!dir) {
      return { ...empty, warnings: ['invalid_stream_key'] }
    }
    const jsonl = join(dir, 'moderation.jsonl')
    const meta = this.readMetaSync(dir)
    if (!existsSync(jsonl)) {
      return { ...empty, meta }
    }

    const { matched, counts, warnings } = await this.scanFiltered(
      jsonl,
      req.filters
    )
    // matched is chronological (file order). Newest first for UI.
    matched.reverse()
    const slice = matched.slice(req.offset!, req.offset! + req.limit!)
    return {
      streamKey: req.streamKey,
      entries: slice,
      offset: req.offset!,
      limit: req.limit!,
      hasMore: req.offset! + req.limit! < matched.length,
      totalMatched: matched.length,
      counts,
      meta,
      warnings
    }
  }

  /**
   * Itera linhas em ordem de arquivo (antigas → novas).
   * Usado por reader e exporter.
   */
  async *iterateEntries(
    streamKey: string,
    filters?: ModerationLogFilters
  ): AsyncGenerator<ModerationLogEntry, void, unknown> {
    const dir = resolveStreamDir(streamKey)
    if (!dir) return
    const jsonl = join(dir, 'moderation.jsonl')
    if (!existsSync(jsonl)) return
    const stream = createReadStream(jsonl, { encoding: 'utf8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    try {
      for await (const line of rl) {
        const entry = parseLogEntryLine(line)
        if (!entry) continue
        if (!entryMatchesFilters(entry, filters)) continue
        yield entry
      }
    } finally {
      rl.close()
      stream.destroy()
    }
  }

  private async scanFiltered(
    jsonlPath: string,
    filters?: ModerationLogFilters
  ): Promise<{
    matched: ModerationLogEntry[]
    counts: ModerationLogStreamSummary['counts']
    warnings: string[]
  }> {
    const matched: ModerationLogEntry[] = []
    const counts = { timeout: 0, deleted: 0, hide: 0, total: 0 }
    const warnings: string[] = []
    let badLines = 0
    const stream = createReadStream(jsonlPath, { encoding: 'utf8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    try {
      for await (const line of rl) {
        if (!line.trim()) continue
        const entry = parseLogEntryLine(line)
        if (!entry) {
          badLines++
          continue
        }
        counts.total++
        counts[entry.action]++
        if (entryMatchesFilters(entry, filters)) matched.push(entry)
      }
    } finally {
      rl.close()
      stream.destroy()
    }
    if (badLines > 0) warnings.push(`skipped_lines:${badLines}`)
    return { matched, counts, warnings }
  }

  private async summarizeStream(
    streamKey: string
  ): Promise<ModerationLogStreamSummary | null> {
    const dir = resolveStreamDir(streamKey)
    if (!dir) return null
    const meta = this.readMetaSync(dir)
    const parts = splitStreamKey(streamKey)
    if (!parts) return null
    const counts = { timeout: 0, deleted: 0, hide: 0, total: 0 }
    const jsonl = join(dir, 'moderation.jsonl')
    if (existsSync(jsonl)) {
      const stream = createReadStream(jsonl, { encoding: 'utf8' })
      const rl = createInterface({ input: stream, crlfDelay: Infinity })
      try {
        for await (const line of rl) {
          if (!line.trim()) continue
          const entry = parseLogEntryLine(line)
          if (!entry) continue
          counts.total++
          counts[entry.action]++
        }
      } finally {
        rl.close()
        stream.destroy()
      }
    }
    const dateFromFolder = parts.folderName.slice(0, 10)
    return {
      key: streamKey,
      channelId: meta?.channelId || parts.channelId,
      channelName: meta?.channelName || parts.channelId,
      videoId: meta?.videoId || '',
      title: meta?.title || parts.folderName,
      date: /^\d{4}-\d{2}-\d{2}$/.test(dateFromFolder)
        ? dateFromFolder
        : meta?.createdAt?.slice(0, 10) || '',
      createdAt: meta?.createdAt || '',
      counts
    }
  }

  private readMetaSync(dir: string): ModerationLogStreamMeta | null {
    const metaPath = join(dir, 'metadata.json')
    if (!existsSync(metaPath)) return null
    try {
      return JSON.parse(readFileSync(metaPath, 'utf8')) as ModerationLogStreamMeta
    } catch {
      return null
    }
  }
}

export const moderationLogReader = new ModerationLogReader()
