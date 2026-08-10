import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export const MAX_MODERATION_STATE_ENTRIES = 200

export type ModerationStateEntry = {
  videoId: string
  authorChannelId: string
  moderatedThrough: number
}

type ModerationState = {
  version: 1
  entries: ModerationStateEntry[]
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(value)
}

function entryKey(videoId: string, authorChannelId: string): string {
  return `${videoId}\u0000${authorChannelId}`
}

export function normalizeModerationStateEntries(
  value: unknown
): ModerationStateEntry[] {
  const raw = Array.isArray(value) ? value : []
  const newest = new Map<string, ModerationStateEntry>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as {
      videoId?: unknown
      authorChannelId?: unknown
      moderatedThrough?: unknown
    }
    if (!validId(entry.videoId) || !validId(entry.authorChannelId)) continue
    if (
      typeof entry.moderatedThrough !== 'number' ||
      !Number.isFinite(entry.moderatedThrough) ||
      entry.moderatedThrough <= 0
    ) {
      continue
    }

    const key = entryKey(entry.videoId, entry.authorChannelId)
    const previous = newest.get(key)
    if (!previous || entry.moderatedThrough > previous.moderatedThrough) {
      newest.set(key, {
        videoId: entry.videoId,
        authorChannelId: entry.authorChannelId,
        moderatedThrough: entry.moderatedThrough
      })
    }
  }

  return [...newest.values()]
    .sort((a, b) => b.moderatedThrough - a.moderatedThrough)
    .slice(0, MAX_MODERATION_STATE_ENTRIES)
}

export function isMessageModerated(timestamp: number, cutoff: number): boolean {
  return cutoff > 0 && Number.isFinite(timestamp) && timestamp <= cutoff
}

export function applyModerationCutoff<
  T extends { timestamp: number; removed?: boolean; pending?: boolean }
>(message: T, cutoff: number): T {
  if (!isMessageModerated(message.timestamp, cutoff)) return message
  return { ...message, removed: true, pending: false }
}

export class ModerationStateStore {
  private entries: ModerationStateEntry[] | null = null

  constructor(
    private readonly readState: () => unknown,
    private readonly writeState: (state: ModerationState) => void
  ) {}

  private current(): ModerationStateEntry[] {
    if (this.entries) return this.entries
    const raw = this.readState()
    const entries =
      raw && typeof raw === 'object'
        ? (raw as { entries?: unknown }).entries
        : []
    this.entries = normalizeModerationStateEntries(entries)
    return this.entries
  }

  getCutoff(videoId: string, authorChannelId: string): number {
    return (
      this.current().find(
        (entry) =>
          entry.videoId === videoId &&
          entry.authorChannelId === authorChannelId
      )?.moderatedThrough || 0
    )
  }

  recordThrough(
    videoId: string,
    authorChannelId: string,
    moderatedThrough = Date.now()
  ): number {
    if (!validId(videoId) || !validId(authorChannelId)) {
      throw new Error('Identificador inválido para o estado de moderação')
    }
    if (!Number.isFinite(moderatedThrough) || moderatedThrough <= 0) {
      throw new Error('Horário inválido para o estado de moderação')
    }

    const entries = normalizeModerationStateEntries([
      ...this.current(),
      { videoId, authorChannelId, moderatedThrough }
    ])
    this.writeState({ version: 1, entries })
    this.entries = entries
    return this.getCutoff(videoId, authorChannelId)
  }

  clear(videoId: string, authorChannelId: string): void {
    const entries = this.current().filter(
      (entry) =>
        entry.videoId !== videoId || entry.authorChannelId !== authorChannelId
    )
    if (entries.length === this.current().length) return
    this.writeState({ version: 1, entries })
    this.entries = entries
  }
}

function filePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'moderation-state.json')
}

const diskStore = new ModerationStateStore(
  () => {
    const path = filePath()
    if (!existsSync(path)) return { version: 1, entries: [] }
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as unknown
    } catch {
      return { version: 1, entries: [] }
    }
  },
  (state) => {
    writeFileSync(filePath(), JSON.stringify(state), 'utf8')
  }
)

export function getModerationCutoff(
  videoId: string,
  authorChannelId: string
): number {
  return diskStore.getCutoff(videoId, authorChannelId)
}

export function recordModerationThrough(
  videoId: string,
  authorChannelId: string,
  moderatedThrough = Date.now()
): number {
  return diskStore.recordThrough(videoId, authorChannelId, moderatedThrough)
}

export function clearModerationCutoff(
  videoId: string,
  authorChannelId: string
): void {
  diskStore.clear(videoId, authorChannelId)
}
