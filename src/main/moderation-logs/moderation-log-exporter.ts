/**
 * Exportação CSV (RFC 4180) com BOM UTF-8, streaming.
 */
import { createWriteStream } from 'fs'
import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import type {
  ModerationLogEntry,
  ModerationLogFilters
} from '../../shared/contracts/moderation-logs'
import { formatIsoDateForLocale } from '../../shared/i18n/date'
import { formatLocalDate } from './moderation-log-paths'
import {
  ModerationLogReader,
  sanitizeFilters
} from './moderation-log-reader'

const ACTION_LABELS_EN: Record<string, string> = {
  timeout: 'Timeout',
  deleted: 'Deleted',
  hide: 'Ban'
}

const ACTION_LABELS_PT: Record<string, string> = {
  timeout: 'Timeout',
  deleted: 'Apagada',
  hide: 'Ban'
}

export function escapeCsvField(value: string): string {
  const normalized = String(value || '')
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n]+/g, ' ')
  if (/[",\n]/.test(normalized) || normalized.includes(',')) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

export function actionLabel(
  action: string,
  locale: string
): string {
  const map = locale.startsWith('pt') ? ACTION_LABELS_PT : ACTION_LABELS_EN
  return map[action] || action
}

const CSV_ACTION_PRIORITY: Readonly<Record<string, number>> = {
  hide: 1,
  timeout: 2,
  deleted: 3
}

export function sortEntriesForCsv<T extends { action: string }>(entries: T[]): T[] {
  return entries.sort(
    (a, b) =>
      (CSV_ACTION_PRIORITY[a.action] ?? 99) -
      (CSV_ACTION_PRIORITY[b.action] ?? 99)
  )
}
export class ModerationLogExporter {
  constructor(private readonly reader = new ModerationLogReader()) {}

  async exportToFile(opts: {
    streamKey: string
    videoId?: string
    filters?: ModerationLogFilters
    locale?: string
    parentWindow?: BrowserWindow | null
  }): Promise<{ filePath: string; rows: number } | null> {
    const filters = sanitizeFilters(opts.filters)
    const locale = opts.locale || 'en-US'
    const date = formatLocalDate(new Date())
    const videoPart = (opts.videoId || 'stream').replace(/[^\w.-]+/g, '_').slice(0, 40)
    const defaultName = `moderation-logs-${videoPart}-${date}.csv`

    const saveOpts = {
      title: 'Export moderation logs',
      defaultPath: defaultName,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    }
    const result = opts.parentWindow
      ? await dialog.showSaveDialog(opts.parentWindow, saveOpts)
      : await dialog.showSaveDialog(saveOpts)
    if (result.canceled || !result.filePath) return null

    const filePath = result.filePath
    const rows = await this.writeCsvStream({
      filePath,
      streamKey: opts.streamKey,
      filters,
      locale
    })
    return { filePath, rows }
  }

  async writeCsvStream(opts: {
    filePath: string
    streamKey: string
    filters?: ModerationLogFilters
    locale: string
  }): Promise<number> {
    const out = createWriteStream(opts.filePath, { encoding: 'utf8' })
    const header =
      opts.locale.startsWith('pt')
        ? 'data,hora,moderador,usuario,acao,mensagem'
        : 'date,time,moderator,user,action,message'
    await writeChunk(out, `\uFEFF${header}\n`)

    // Export newest first (same as UI)
    const buffer: ModerationLogEntry[] = []
    for await (const entry of this.reader.iterateEntries(
      opts.streamKey,
      opts.filters
    )) {
      buffer.push(entry)
    }
    buffer.reverse()
    sortEntriesForCsv(buffer)
    let rows = 0
    for (const entry of buffer) {
      await writeChunk(out, `${entryToCsvLine(entry, opts.locale)}\n`)
      rows++
    }
    await new Promise<void>((resolve, reject) => {
      out.end(() => resolve())
      out.on('error', reject)
    })
    return rows
  }
}

export function entryToCsvLine(
  entry: {
    date: string
    time: string
    moderator: string
    user: string
    action: string
    message: string
  },
  locale: string
): string {
  return [
    escapeCsvField(formatIsoDateForLocale(entry.date, locale)),
    escapeCsvField(entry.time),
    escapeCsvField(entry.moderator),
    escapeCsvField(entry.user),
    escapeCsvField(actionLabel(entry.action, locale)),
    escapeCsvField(entry.message)
  ].join(',')
}

function writeChunk(
  stream: NodeJS.WritableStream,
  chunk: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = stream.write(chunk, (error) => {
      if (error) reject(error)
    })
    if (ok) resolve()
    else stream.once('drain', () => resolve())
  })
}

export const moderationLogExporter = new ModerationLogExporter()
