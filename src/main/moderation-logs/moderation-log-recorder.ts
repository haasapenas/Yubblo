/**
 * Único ponto de entrada para capturar registros de moderação.
 * Falha de disco nunca propaga para o fluxo de moderação.
 */
import type { ModerationLogAction } from '../../shared/contracts/moderation-logs'
import { ModerationLogDeduplicator } from './moderation-log-deduplicator'
import {
  normalizeDisplayName,
  normalizeLogEntry
} from './moderation-log-normalize'
import {
  ModerationLogStore,
  type StreamContext
} from './moderation-log-store'

export interface RecordModerationInput {
  action: ModerationLogAction
  moderator?: string | null
  user?: string | null
  /** Mensagem afetada (delete) ou última conhecida (timeout/hide). */
  message?: string | null
  at?: number
  stream: StreamContext
}

export type ModerationLogAppendListener = (payload: {
  streamKey: string
  entry: ReturnType<typeof normalizeLogEntry>
}) => void

export type ModerationLogErrorListener = (payload: {
  message: string
  streamKey?: string
}) => void

export class ModerationLogRecorder {
  private readonly store: ModerationLogStore
  private readonly dedup: ModerationLogDeduplicator
  private appendListeners = new Set<ModerationLogAppendListener>()
  private errorListeners = new Set<ModerationLogErrorListener>()

  constructor(
    store = new ModerationLogStore(),
    dedup = new ModerationLogDeduplicator()
  ) {
    this.store = store
    this.dedup = dedup
  }

  getStore(): ModerationLogStore {
    return this.store
  }

  onAppend(listener: ModerationLogAppendListener): () => void {
    this.appendListeners.add(listener)
    return () => this.appendListeners.delete(listener)
  }

  onError(listener: ModerationLogErrorListener): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  /**
   * Grava se não for eco duplicado. Nunca lança.
   * @returns streamKey se enfileirou, null se ignorou/erro de contexto.
   */
  record(input: RecordModerationInput): string | null {
    try {
      if (!input.stream.videoId) return null
      const moderator = normalizeDisplayName(input.moderator)
      const moderatorKey = moderator
        .replace(/^@/, '')
        .replace(/^\(|\)$/g, '')
        .trim()
        .toLowerCase()
      if (!moderatorKey || moderatorKey === 'unknown') return null
      const streamKey = this.store.resolveOrCreateStreamKey(input.stream)
      const entry = normalizeLogEntry({
        action: input.action,
        moderator,
        user: input.user,
        message: input.message,
        at: input.at
      })
      if (
        this.dedup.isDuplicate({
          streamKey,
          action: entry.action,
          moderator: entry.moderator,
          user: entry.user,
          message: entry.message,
          at: input.at ?? Date.now()
        })
      ) {
        return null
      }
      void this.store
        .enqueueAppend(streamKey, input.stream, entry)
        .then(() => {
          for (const listener of this.appendListeners) {
            try {
              listener({ streamKey, entry })
            } catch (error) {
              console.warn('[mod-logs] append listener failed', error)
            }
          }
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : String(error)
          console.warn('[mod-logs] append failed', message)
          for (const listener of this.errorListeners) {
            try {
              listener({ message, streamKey })
            } catch {
              /* ignore */
            }
          }
        })
      return streamKey
    } catch (error) {
      console.warn('[mod-logs] record failed', error)
      return null
    }
  }
}

/** Singleton do processo principal. */
export const moderationLogRecorder = new ModerationLogRecorder()
