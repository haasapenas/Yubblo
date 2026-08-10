/** Contratos do sistema de registros de moderação (persistência + UI). */

export type ModerationLogAction = 'timeout' | 'deleted' | 'hide'

/** Uma linha persistida em moderation.jsonl (sem IDs técnicos). */
export interface ModerationLogEntry {
  date: string
  time: string
  moderator: string
  user: string
  action: ModerationLogAction
  message: string
}

/** Metadados da pasta da transmissão. */
export interface ModerationLogStreamMeta {
  channelId: string
  channelName: string
  channelHandle?: string
  videoId: string
  title: string
  createdAt: string
}

/** Chave interna segura: channelId/streamFolderName (nunca path absoluto). */
export type ModerationLogStreamKey = string

export interface ModerationLogStreamSummary {
  key: ModerationLogStreamKey
  channelId: string
  channelName: string
  videoId: string
  title: string
  date: string
  createdAt: string
  counts: {
    timeout: number
    deleted: number
    hide: number
    total: number
  }
}

export interface ModerationLogChannelGroup {
  channelId: string
  channelName: string
  streams: ModerationLogStreamSummary[]
}

export interface ModerationLogFilters {
  actions?: ModerationLogAction[]
  /** YYYY-MM-DD inclusive */
  dateFrom?: string
  dateTo?: string
  /** substring case-insensitive em user ou moderator */
  query?: string
}

export interface ModerationLogPageRequest {
  streamKey: ModerationLogStreamKey
  filters?: ModerationLogFilters
  /** offset em entradas já filtradas (0 = mais recentes) */
  offset?: number
  limit?: number
}

export interface ModerationLogPage {
  streamKey: ModerationLogStreamKey
  entries: ModerationLogEntry[]
  offset: number
  limit: number
  hasMore: boolean
  totalMatched: number
  counts: ModerationLogStreamSummary['counts']
  meta: ModerationLogStreamMeta | null
  warnings: string[]
}

export interface ModerationLogExportResult {
  filePath: string
  rows: number
}

export interface ModerationLogAppendEvent {
  streamKey: ModerationLogStreamKey
  entry: ModerationLogEntry
}

export interface ModerationLogErrorEvent {
  message: string
  streamKey?: ModerationLogStreamKey
}
