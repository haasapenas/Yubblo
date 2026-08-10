import type { ModMenuResult } from '../../shared/types'

export interface ModerationPrefetchSession {
  itemStore: Pick<Map<string, unknown>, 'has'>
  modMenuCache: Map<string, ModMenuResult>
  modPrefetchQueue: string[]
  modPrefetchInFlight: Set<string>
  modPrefetchActive: number
}

interface ModerationPrefetchDeps {
  getSession: (videoId: string) => ModerationPrefetchSession | undefined
  fetchMenu: (messageId: string, videoId: string) => Promise<ModMenuResult>
  onReady?: (menu: ModMenuResult & { videoId: string }) => void
}

export class ModerationPrefetch {
  private static readonly CONCURRENCY = 1
  private static readonly QUEUE_MAX = 12

  constructor(private readonly deps: ModerationPrefetchDeps) {}

  queue(messageId: string, videoId: string): void {
    const session = this.deps.getSession(videoId)
    if (!messageId || !session || session.modMenuCache.has(messageId)) return
    if (session.modPrefetchInFlight.has(messageId)) return
    if (session.modPrefetchQueue.includes(messageId)) return

    session.modPrefetchQueue.push(messageId)
    while (session.modPrefetchQueue.length > ModerationPrefetch.QUEUE_MAX) {
      session.modPrefetchQueue.shift()
    }
    void this.pump(videoId)
  }

  private async pump(videoId: string): Promise<void> {
    const session = this.deps.getSession(videoId)
    if (!session) return

    while (
      session.modPrefetchActive < ModerationPrefetch.CONCURRENCY &&
      session.modPrefetchQueue.length > 0
    ) {
      const messageId = session.modPrefetchQueue.shift()!
      if (
        session.modMenuCache.has(messageId) ||
        session.modPrefetchInFlight.has(messageId) ||
        !session.itemStore.has(messageId)
      ) {
        continue
      }

      session.modPrefetchActive++
      session.modPrefetchInFlight.add(messageId)
      void this.deps.fetchMenu(messageId, videoId)
        .then((result) => {
          session.modMenuCache.set(messageId, result)
          this.deps.onReady?.({ ...result, videoId })
        })
        .catch(() => {
          // O clique ainda faz uma tentativa normal se a pre-busca falhar.
        })
        .finally(() => {
          session.modPrefetchInFlight.delete(messageId)
          session.modPrefetchActive--
          void this.pump(videoId)
        })
    }
  }
}
