import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export const MAX_CHAT_CLEAR_ENTRIES = 100

export type ChatClearEntry = {
  videoId: string
  clearedAt: number
}

type ChatClearState = {
  version: 1
  entries: ChatClearEntry[]
}

function validVideoId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{6,32}$/.test(value)
}

export function normalizeChatClearEntries(value: unknown): ChatClearEntry[] {
  const raw = Array.isArray(value) ? value : []
  const newest = new Map<string, number>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as { videoId?: unknown; clearedAt?: unknown }
    if (!validVideoId(entry.videoId)) continue
    if (
      typeof entry.clearedAt !== 'number' ||
      !Number.isFinite(entry.clearedAt) ||
      entry.clearedAt <= 0
    ) {
      continue
    }

    const previous = newest.get(entry.videoId) || 0
    if (entry.clearedAt > previous) {
      newest.set(entry.videoId, entry.clearedAt)
    }
  }

  return [...newest.entries()]
    .map(([videoId, clearedAt]) => ({ videoId, clearedAt }))
    .sort((a, b) => b.clearedAt - a.clearedAt)
    .slice(0, MAX_CHAT_CLEAR_ENTRIES)
}

export function isMessageAfterClear(timestamp: number, cutoff: number): boolean {
  return !Number.isFinite(timestamp) || timestamp > cutoff
}

export class ChatClearStore {
  private entries: ChatClearEntry[] | null = null

  constructor(
    private readonly readState: () => unknown,
    private readonly writeState: (state: ChatClearState) => void
  ) {}

  private current(): ChatClearEntry[] {
    if (this.entries) return this.entries

    const raw = this.readState()
    const entries =
      raw && typeof raw === 'object'
        ? (raw as { entries?: unknown }).entries
        : []
    this.entries = normalizeChatClearEntries(entries)
    return this.entries
  }

  getCutoff(videoId: string): number {
    return (
      this.current().find((entry) => entry.videoId === videoId)?.clearedAt || 0
    )
  }

  clearThrough(videoId: string, clearedAt = Date.now()): number {
    if (!validVideoId(videoId)) {
      throw new Error('videoId inválido para /clear')
    }
    if (!Number.isFinite(clearedAt) || clearedAt <= 0) {
      throw new Error('Horário inválido para /clear')
    }

    const entries = normalizeChatClearEntries([
      ...this.current(),
      { videoId, clearedAt }
    ])
    this.writeState({ version: 1, entries })
    this.entries = entries
    return clearedAt
  }
}

function filePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'chat-clear.json')
}

const diskStore = new ChatClearStore(
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
    writeFileSync(filePath(), JSON.stringify(state, null, 2), 'utf8')
  }
)

export function getChatClearCutoff(videoId: string): number {
  return diskStore.getCutoff(videoId)
}

export function clearChatThrough(
  videoId: string,
  clearedAt = Date.now()
): number {
  return diskStore.clearThrough(videoId, clearedAt)
}
