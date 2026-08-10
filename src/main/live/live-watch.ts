/**
 * Live Watch — detecta quando uma aba offline volta a ter live
 * e reconecta na MESMA aba (mesmo tabKey), sem abrir chat/aba nova.
 *
 * Módulo isolado para não inflar o chat-service.
 */
import { pendingTabId, isPendingTabId } from '../chat/channels-store'
import type { ChatStatus, LiveSessionInfo, OpenChannelOpts } from '../../shared/types'

/** Snapshot mínimo da sessão (sem acoplar ao ChannelSession interno) */
export type LiveWatchTab = {
  videoId: string
  status: ChatStatus
  hasPoller: boolean
  info: Pick<LiveSessionInfo, 'videoId' | 'channelHandle' | 'input' | 'tabKey' | 'channelName'>
  tabKey: string
}

export type LiveWatchHost = {
  /** Cookie + sessão Innertube prontos */
  canProbe: () => boolean
  /** Restore/rejoin em andamento — não competir */
  isBusy: () => boolean
  listTabs: () => LiveWatchTab[]
  /** Resolve @handle ou UC… → videoId se /live estiver ao vivo */
  resolveLiveVideoId: (handleOrChannelId: string) => Promise<string | null>
  /** Confirma se um videoId está ao vivo agora (p/ acordar aba offline) */
  isVideoLive: (videoId: string) => Promise<boolean>
  /**
   * Só true se a transmissão realmente encerrou.
   * Upcoming / waiting room / chat por link não deve ser true.
   */
  isStreamEnded: (videoId: string) => Promise<boolean>
  /** Já tem poller neste videoId? */
  hasLivePoller: (videoId: string) => boolean
  markEnded: (videoId: string) => void
  activeVideoId: () => string | null
  /**
   * Reabre o chat. Deve honrar tabKey / replacePending / replaceVideoId
   * para não criar aba nova.
   */
  reopenOnSameTab: (videoId: string, opts: OpenChannelOpts) => Promise<void>
}

export type LiveWatchOptions = {
  /** ms entre ciclos (default 90s) */
  intervalMs?: number
  /** abas offline por ciclo (default 3) */
  perTick?: number
  /** delay do 1º tick (default 20s) */
  firstDelayMs?: number
}

const DEFAULT_INTERVAL_MS = 90_000
const DEFAULT_PER_TICK = 3
const DEFAULT_FIRST_DELAY_MS = 20_000

export function extractChannelHandle(tab: LiveWatchTab): string | undefined {
  if (tab.info.channelHandle) {
    return tab.info.channelHandle.replace(/^@/, '')
  }
  if (tab.tabKey.startsWith('h:')) return tab.tabKey.slice(2)
  const input = (tab.info.input || '').trim()
  if (input.startsWith('@')) return input.slice(1).replace(/\/.*$/, '')
  if (/^UC[\w-]{20,}$/.test(input)) return input
  if (/^[a-zA-Z0-9._-]{3,30}$/.test(input) && !/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input
  }
  return undefined
}

export class LiveWatchController {
  private timer: ReturnType<typeof setInterval> | null = null
  private firstShot: ReturnType<typeof setTimeout> | null = null
  private running = false
  private cursor = 0
  private liveCursor = 0
  private readonly intervalMs: number
  private readonly perTick: number
  private readonly firstDelayMs: number

  constructor(
    private readonly host: LiveWatchHost,
    opts?: LiveWatchOptions
  ) {
    this.intervalMs = opts?.intervalMs ?? DEFAULT_INTERVAL_MS
    this.perTick = opts?.perTick ?? DEFAULT_PER_TICK
    this.firstDelayMs = opts?.firstDelayMs ?? DEFAULT_FIRST_DELAY_MS
  }

  /** Idempotente — só arma se ainda não estiver rodando. */
  start(): void {
    if (this.timer) return
    if (!this.host.canProbe()) return
    console.log(
      `[live-watch] ativo — a cada ${this.intervalMs / 1000}s (máx ${this.perTick}/ciclo)`
    )
    this.timer = setInterval(() => {
      void this.tick()
    }, this.intervalMs)
    this.firstShot = setTimeout(() => void this.tick(), this.firstDelayMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.firstShot) {
      clearTimeout(this.firstShot)
      this.firstShot = null
    }
    this.running = false
  }

  get active(): boolean {
    return !!this.timer
  }

  private offlineTabs(): LiveWatchTab[] {
    return this.host.listTabs().filter(
      (t) =>
        !t.hasPoller &&
        (t.status === 'ended' || t.status === 'error') &&
        (t.info.channelHandle ||
          t.info.input ||
          (t.videoId && !isPendingTabId(t.videoId)))
    )
  }

  private async tick(): Promise<void> {
    if (this.running || this.host.isBusy() || !this.host.canProbe()) return

    this.running = true
    try {
      await this.checkEndedLives()
      const offline = this.offlineTabs()
      if (offline.length === 0) return
      const n = Math.min(this.perTick, offline.length)
      for (let i = 0; i < n; i++) {
        const idx = (this.cursor + i) % offline.length
        const snap = offline[idx]!
        // Re-resolve: status pode ter mudado no meio do ciclo
        const current = this.host
          .listTabs()
          .find((t) => t.tabKey === snap.tabKey || t.videoId === snap.videoId)
        if (
          !current ||
          current.hasPoller ||
          (current.status !== 'ended' && current.status !== 'error')
        ) {
          continue
        }
        await this.tryWake(current)
      }
      this.cursor = (this.cursor + n) % Math.max(offline.length, 1)
    } finally {
      this.running = false
    }
  }

  private async checkEndedLives(): Promise<void> {
    const live = this.host.listTabs().filter((tab) =>
      tab.status === 'live' && !isPendingTabId(tab.videoId)
    )
    if (!live.length) return
    const activeId = this.host.activeVideoId()
    const active = live.find((tab) => tab.videoId === activeId)
    const others = live.filter((tab) => tab.videoId !== activeId)
    const rotating = others.length ? others[this.liveCursor++ % others.length] : undefined
    for (const tab of [active, rotating].filter((item): item is LiveWatchTab => !!item)) {
      try {
        // NÃO usar !isVideoLive: upcoming/programada/unlisted com chat aberto
        // devolve false em is_live e derrubava o poller → CHAT_UNAVAILABLE.
        if (await this.host.isStreamEnded(tab.videoId)) {
          console.log(`[live-watch] ${tab.videoId} encerrou`)
          this.host.markEnded(tab.videoId)
        }
      } catch {
        // Falha de rede nao significa live encerrada.
      }
    }
  }
  private async tryWake(tab: LiveWatchTab): Promise<void> {
    const handle = extractChannelHandle(tab)
    const oldVideoId = isPendingTabId(tab.videoId) ? undefined : tab.videoId
    let liveVideoId: string | null = null

    // 1) @canal/live ou UC…/live
    if (handle) {
      try {
        liveVideoId = await this.host.resolveLiveVideoId(handle)
      } catch {
        /* offline */
      }
    }

    // 2) videoId da aba / input ainda ao vivo?
    if (!liveVideoId) {
      const candidates = [oldVideoId, tab.info.input].filter(
        (v): v is string =>
          typeof v === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(v)
      )
      for (const vid of candidates) {
        try {
          if (await this.host.isVideoLive(vid)) {
            liveVideoId = vid
            break
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (!liveVideoId) return

    if (this.host.hasLivePoller(liveVideoId)) {
      console.log(`[live-watch] ${tab.tabKey} já live em ${liveVideoId}`)
      return
    }

    const activeId = this.host.activeVideoId()
    const wasActive =
      activeId === tab.videoId || activeId === pendingTabId(tab.tabKey)

    console.log(
      `[live-watch] ${tab.tabKey} → ao vivo ${liveVideoId} — mesma aba`
    )

    try {
      await this.host.reopenOnSameTab(liveVideoId, {
        activate: wasActive,
        quietStatus: !wasActive,
        tabKey: tab.tabKey,
        replacePending: true,
        replaceVideoId:
          oldVideoId && oldVideoId !== liveVideoId ? oldVideoId : undefined,
        replaceSameChannel: !!handle,
        sourceInput: handle ? `@${handle}` : tab.info.input || liveVideoId,
        channelHandle: handle,
        preferVideoTab: tab.tabKey.startsWith('v:')
      })
    } catch (e) {
      console.warn(
        `[live-watch] falhou ${tab.tabKey}:`,
        (e as Error).message
      )
    }
  }
}
