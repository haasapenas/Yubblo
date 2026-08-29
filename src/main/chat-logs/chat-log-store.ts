import { app } from 'electron'
import { appendFile, mkdir } from 'fs/promises'
import { existsSync, readdirSync, statSync } from 'fs'
import { dirname, join } from 'path'
import {
  chatLogsRoot,
  liveLogPath,
  normalizeChannelKey,
  sanitizePathSegment
} from './chat-log-paths'

export interface ChatLogAppendContext {
  channelKey: string
  videoId: string
  title: string
  line: string
}

interface QueueState {
  filePath: string
  queue: Promise<void>
}

export class ChatLogStore {
  private readonly states = new Map<string, QueueState>()

  constructor(private readonly basePath: () => string = () => app.getPath('userData')) {}

  enqueueAppend(context: ChatLogAppendContext, at = new Date()): Promise<void> {
    const videoId = String(context.videoId || '').trim()
    if (!videoId) return Promise.resolve()

    const channelKey = normalizeChannelKey(context.channelKey) || 'unknown'
    const stateKey = `${channelKey}\u0000${videoId}`
    let state = this.states.get(stateKey)
    if (!state) {
      const filePath = this.resolveFilePath(channelKey, videoId, context.title, at)
      if (!filePath) return Promise.resolve()
      state = { filePath, queue: Promise.resolve() }
      this.states.set(stateKey, state)
    }

    const line = String(context.line || '').endsWith('\n')
      ? String(context.line || '')
      : `${String(context.line || '')}\n`
    const next = state.queue
      .catch(() => undefined)
      .then(() => this.writeAppend(state!.filePath, line))
    state.queue = next.catch((error) => {
      console.warn('[chat-logs] write failed', state!.filePath, error)
      throw error
    })
    return next
  }

  async flush(): Promise<void> {
    await Promise.all([...this.states.values()].map((state) => state.queue.catch(() => undefined)))
  }

  private resolveFilePath(
    channelKey: string,
    videoId: string,
    title: string,
    at: Date
  ): string | null {
    const base = this.basePath()
    const root = chatLogsRoot(base)
    const channelFolder = sanitizePathSegment(channelKey, 64)
    const existing = this.findPersistedFile(root, channelFolder, videoId)
    return existing || liveLogPath(channelKey, videoId, title, at, base)
  }

  private findPersistedFile(
    root: string,
    channelFolder: string,
    videoId: string
  ): string | null {
    const directory = join(root, channelFolder)
    if (!existsSync(directory)) return null
    const token = `_${sanitizePathSegment(videoId, 40)}_`
    try {
      const match = readdirSync(directory)
        .filter((name) => name.endsWith('.txt') && name.includes(token))
        .sort()
        .find((name) => {
          try {
            return statSync(join(directory, name)).isFile()
          } catch {
            return false
          }
        })
      return match ? join(directory, match) : null
    } catch {
      return null
    }
  }

  private async writeAppend(filePath: string, line: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
    await appendFile(filePath, line, 'utf8')
  }
}
