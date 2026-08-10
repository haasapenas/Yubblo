import type {
  AppError,
  ChannelTab,
  ChatStatus,
  LiveSessionInfo
} from '../../shared/types'
import { clearChannelSessionRuntime, type ChannelSession } from './chat-session'
import {
  isPendingTabId,
  loadChannels,
  makeChannelKey,
  mapPool,
  pendingTabId,
  removeSavedChannel,
  saveChannels,
  tabKeyFromPendingId,
  upsertSavedChannel,
  type SavedChannel
} from './channels-store'
import type { SessionRegistry } from './session-registry'

export interface SessionLifecycleDeps {
  registry: SessionRegistry
  canReadChat(): boolean
  createSession(info: LiveSessionInfo): ChannelSession
  openByChannel(
    input: string,
    options: {
      activate?: boolean
      quietStatus?: boolean
      tabKey?: string
      replacePending?: boolean
      sourceInput?: string
      channelHandle?: string
      preferVideoTab?: boolean
    }
  ): Promise<unknown>
  startLiveWatch(): void
  canModerate(session: ChannelSession): boolean
  emitSessions(payload: {
    tabs: ChannelTab[]
    activeVideoId: string | null
  }): void
  emitStatus(
    status: ChatStatus,
    error?: AppError,
    videoId?: string
  ): void
}

export class SessionLifecycle {
  private restoring = false
  private restorePromise: Promise<void> | null = null

  constructor(private readonly deps: SessionLifecycleDeps) {}

  isRestoring(): boolean {
    return this.restoring
  }

  private get sessions(): Map<string, ChannelSession> {
    return this.deps.registry.storage()
  }

  private get activeVideoId(): string | null {
    return this.deps.registry.activeId()
  }

  private set activeVideoId(videoId: string | null) {
    this.deps.registry.setActive(videoId)
  }

  private active(): ChannelSession | null {
    return this.deps.registry.active()
  }

  async restoreSavedChannels(): Promise<void> {
    if (this.restorePromise) return this.restorePromise
    if (!this.deps.canReadChat()) return

    this.restorePromise = (async () => {
      const file = loadChannels()
      if (!file.channels.length) {
        console.log('[chat-service] nenhum canal salvo para restaurar')
        return
      }
      const sorted = [...file.channels].sort((a, b) => a.order - b.order)
      console.log(
        `[chat-service] restaurando ${sorted.length} canal(is) — abas na hora + join paralelo`
      )
      this.restoring = true

      try {
        // ── 1. Exibe imediatamente a lista completa de canais salvos ──
        for (const ch of sorted) {
          const pid = pendingTabId(ch.key)
          // já tem sessão real deste canal?
          const already = [...this.sessions.values()].some(
            (s) => this.sessionTabKey(s) === ch.key && !isPendingTabId(s.info.videoId)
          )
          if (already || this.sessions.has(pid)) continue

          const info: LiveSessionInfo = {
            videoId: pid,
            title: ch.title || 'Conectando…',
            channelName: ch.channelName || ch.channelHandle || ch.input,
            channelHandle: ch.channelHandle,
            input: ch.input,
            isLive: false,
            tabKey: ch.key
          }
          const session = this.deps.createSession(info)
          session.status = 'connecting'
          this.deps.registry.add(session)
        }

        // Aba ativa salva (placeholder até o join)
        if (file.activeKey) {
          const want = pendingTabId(file.activeKey)
          if (this.sessions.has(want)) {
            this.activeVideoId = want
          } else {
            for (const s of this.sessions.values()) {
              if (this.sessionTabKey(s) === file.activeKey) {
                this.activeVideoId = s.info.videoId
                break
              }
            }
          }
        }
        if (!this.activeVideoId || !this.sessions.has(this.activeVideoId)) {
          this.activeVideoId = this.sessions.keys().next().value || null
        }

        this.emitSessions()
        const active = this.active()
        if (active) {
          this.deps.emitStatus('connecting', undefined, active.info.videoId)
        }

        // ── 2. Conecta os canais em paralelo após montar as abas ──
        const CONCURRENCY = 4
        await mapPool(sorted, CONCURRENCY, async (ch) => {
          await this.reconnectSavedChannel(ch, file.activeKey)
        })

        // Promove active só se ainda for placeholder do canal salvo (não rouba foco do usuário)
        if (file.activeKey && this.activeVideoId) {
          const cur = this.sessions.get(this.activeVideoId)
          const pendingKey = tabKeyFromPendingId(this.activeVideoId)
          const stillPendingForSaved =
            !!pendingKey && pendingKey === file.activeKey && (!cur || isPendingTabId(this.activeVideoId))
          if (stillPendingForSaved || !cur) {
            for (const s of this.sessions.values()) {
              if (this.sessionTabKey(s) === file.activeKey && !isPendingTabId(s.info.videoId)) {
                this.activeVideoId = s.info.videoId
                this.deps.emitStatus(s.status, undefined, s.info.videoId)
                break
              }
            }
          }
        }
        this.emitSessions()
        const finalActive = this.active()
        if (finalActive) {
          this.deps.emitStatus(finalActive.status, undefined, finalActive.info.videoId)
        }
      } finally {
        this.restoring = false
        try {
          let next = loadChannels()
          // Mantém canais salvos; só atualiza lastVideoId dos que conectaram
          for (const s of this.sessions.values()) {
            if (isPendingTabId(s.info.videoId)) continue
            const key = this.sessionTabKey(s)
            next = upsertSavedChannel(
              next,
              {
                key,
                input: s.info.input || s.info.channelHandle || s.info.videoId,
                channelName: s.info.channelName,
                channelHandle: s.info.channelHandle,
                lastVideoId: s.info.videoId,
                title: s.info.title
              },
              s.info.videoId === this.activeVideoId
            )
          }
          if (this.activeVideoId) {
            const act = this.sessions.get(this.activeVideoId)
            if (act) next.activeKey = this.sessionTabKey(act)
          }
          saveChannels(next)
        } catch {
          /* ignore */
        }
        const live = [...this.sessions.values()].filter(
          (s) => !isPendingTabId(s.info.videoId) && s.status === 'live'
        ).length
        console.log(
          `[chat-service] restore ok: ${live} live / ${this.sessions.size} abas de ${sorted.length} salvos`
        )
        this.deps.startLiveWatch()
      }
    })()

    try {
      await this.restorePromise
    } finally {
      this.restorePromise = null
    }
  }

  /**
   * Tenta reabrir um canal salvo. Em falha, a aba placeholder fica com status error/ended
   * A aba permanece visível para representar canais offline.
   */
  private async reconnectSavedChannel(
    ch: SavedChannel,
    preferredActiveKey: string | null
  ): Promise<void> {
    const pendingId = pendingTabId(ch.key)
    // Preferir a live escolhida (lastVideoId) — canais multi-live não devem “pular” de stream
    // Para h:@canal, tenta @handle primeiro (live nova ≠ lastVideoId)
    const handle =
      ch.channelHandle?.replace(/^@/, '') ||
      (ch.key.startsWith('h:') ? ch.key.slice(2) : undefined) ||
      (ch.input.startsWith('@') ? ch.input.slice(1) : undefined)
    const tryInputs = [
      handle ? `@${handle}` : undefined,
      ch.lastVideoId,
      ch.input
    ].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i)
    const shouldActivate =
      preferredActiveKey === ch.key ||
      this.activeVideoId === pendingId ||
      this.activeVideoId === null

    for (const input of tryInputs) {
      try {
        await this.deps.openByChannel(input, {
          activate: shouldActivate,
          quietStatus: !shouldActivate,
          tabKey: ch.key,
          replacePending: true,
          // Mantém @canal + live escolhida (multi-live sobrevive ao relog)
          sourceInput: handle ? `@${handle}` : ch.input,
          channelHandle: handle || ch.channelHandle,
          // h: = 1 aba por canal; v: = fixa no videoId salvo
          preferVideoTab: ch.key.startsWith('v:') && !handle
        })
        this.deps.startLiveWatch()
        return
      } catch (e) {
        const err = e as AppError
        console.warn(
          `[chat-service] restore falhou ${ch.input} via ${input}:`,
          err?.code || (e as Error).message
        )
      }
    }

    // Offline / indisponível — mantém aba na lista
    const s = this.sessions.get(pendingId)
    if (s) {
      s.status = 'ended'
      s.info.title = s.info.title === 'Conectando…' ? 'Offline' : s.info.title
      s.info.isLive = false
      this.emitSessions()
      if (this.activeVideoId === pendingId) {
        this.deps.emitStatus('ended', undefined, pendingId)
      }
    }
    console.warn(`[chat-service] canal offline/indisponível: ${ch.input}`)
    this.deps.startLiveWatch()
  }

  sessionTabKey(session: ChannelSession): string {
    if (session.info.tabKey) return session.info.tabKey
    if (
      session.info.videoId &&
      !isPendingTabId(session.info.videoId)
    ) {
      return `v:${session.info.videoId}`
    }
    return makeChannelKey({
      channelHandle: session.info.channelHandle,
      channelName: session.info.channelName,
      input: session.info.input,
      videoId: session.info.videoId
    })
  }

  getTabs(): ChannelTab[] {
    return this.deps.registry.values().map((session) => ({
      videoId: session.info.videoId,
      title: session.info.title,
      channelName: session.info.channelName,
      channelHandle: session.info.channelHandle,
      isLive: session.info.isLive,
      isReplay: session.info.isReplay,
      status: session.status,
      tabKey: session.info.tabKey || this.sessionTabKey(session),
      canModerate: this.deps.canModerate(session),
      sendCooldownUntil: session.sendCooldownUntil || undefined,
      slowModeSeconds:
        session.slowModeSeconds > 0
          ? session.slowModeSeconds
          : undefined
    }))
  }

  listSessions(): {
    tabs: ChannelTab[]
    activeVideoId: string | null
  } {
    return {
      tabs: this.getTabs(),
      activeVideoId: this.deps.registry.activeId()
    }
  }

  emitSessions(): void {
    this.deps.emitSessions(this.listSessions())
  }

  destroySession(videoId: string): ChannelSession | null {
    const session = this.deps.registry.get(videoId)
    if (!session) return null
    try {
      session.poller?.stop()
    } catch {
      // Sessao ja encerrada.
    }
    try {
      session.liveChat?.stop()
    } catch {
      // Handle ja encerrado.
    }
    clearChannelSessionRuntime(session)
    return this.deps.registry.remove(videoId)
  }

  async switchSession(videoId: string): Promise<LiveSessionInfo | null> {
    const session = this.deps.registry.get(videoId)
    if (!session) return null
    const changed = this.deps.registry.activeId() !== videoId
    this.deps.registry.activate(videoId)
    if (changed) {
      this.emitSessions()
      this.persistChannels()
    }
    this.deps.emitStatus(session.status, undefined, videoId)
    return session.info
  }

  async closeSession(videoId: string): Promise<LiveSessionInfo | null> {
    this.persistRemoveByVideoId(videoId)
    this.destroySession(videoId)
    this.emitSessions()
    if (this.deps.registry.size > 0) this.persistChannels()
    const active = this.deps.registry.active()
    if (active) {
      this.deps.emitStatus(
        active.status,
        undefined,
        active.info.videoId
      )
      return active.info
    }
    this.deps.emitStatus('idle')
    return null
  }

  removeSessionsForTabKey(
    tabKey: string,
    exceptVideoId?: string
  ): void {
    for (const session of this.deps.registry.values()) {
      const videoId = session.info.videoId
      if (exceptVideoId && videoId === exceptVideoId) continue
      if (
        this.sessionTabKey(session) === tabKey ||
        videoId === pendingTabId(tabKey)
      ) {
        this.destroySession(videoId)
      }
    }
  }

  persistRemoveByVideoId(videoId: string): void {
    try {
      const session = this.deps.registry.get(videoId)
      const key = session ? this.sessionTabKey(session) : undefined
      saveChannels(
        removeSavedChannel(loadChannels(), { key, videoId })
      )
    } catch (error) {
      console.warn('[chat-service] persistRemove', error)
    }
  }

  persistChannels(): void {
    if (this.restoring) return
    try {
      const previous = loadChannels()
      const ordered = this.deps.registry.values()
      const activeVideoId = this.deps.registry.activeId()
      const openKeys = new Set(
        ordered.map((session) => this.sessionTabKey(session))
      )
      const openVideoIds = new Set(
        ordered.map((session) => session.info.videoId)
      )
      const openHandles = new Set(
        ordered
          .map((session) =>
            session.info.channelHandle
              ?.replace(/^@/, '')
              .toLowerCase()
          )
          .filter((handle): handle is string => !!handle)
      )
      const kept = previous.channels.filter((channel) => {
        if (openKeys.has(channel.key)) return false
        if (
          channel.lastVideoId &&
          openVideoIds.has(channel.lastVideoId)
        ) {
          return false
        }
        const handle = channel.channelHandle
          ?.replace(/^@/, '')
          .toLowerCase()
        if (handle && openHandles.has(handle)) return false
        return !(
          channel.key.startsWith('h:') &&
          openHandles.has(channel.key.slice(2).toLowerCase())
        )
      })
      let file = {
        version: 1 as const,
        channels: kept,
        activeKey: previous.activeKey
      }
      for (let index = 0; index < ordered.length; index++) {
        const session = ordered[index]!
        const key = this.sessionTabKey(session)
        const saved = previous.channels.find(
          (channel) => channel.key === key
        )
        const realVideoId = isPendingTabId(session.info.videoId)
          ? saved?.lastVideoId
          : session.info.videoId
        const rawInput = (session.info.input || saved?.input || '').trim()
        const stableInput =
          session.info.channelHandle || saved?.channelHandle
            ? `@${(
                session.info.channelHandle ||
                saved?.channelHandle ||
                ''
              ).replace(/^@/, '')}`
            : rawInput &&
                !/^[a-zA-Z0-9_-]{11}$/.test(rawInput)
              ? rawInput
              : rawInput || realVideoId || key
        file = upsertSavedChannel(
          file,
          {
            key,
            input: stableInput,
            channelName:
              session.info.channelName ||
              saved?.channelName ||
              'Canal',
            channelHandle:
              session.info.channelHandle || saved?.channelHandle,
            lastVideoId: realVideoId,
            title: session.info.title || saved?.title,
            order: kept.length + index
          },
          session.info.videoId === activeVideoId ||
            (!!activeVideoId &&
              isPendingTabId(activeVideoId) &&
              tabKeyFromPendingId(activeVideoId) === key)
        )
      }
      const active = this.deps.registry.active()
      if (active) file.activeKey = this.sessionTabKey(active)
      saveChannels(file)
    } catch (error) {
      console.warn('[chat-service] persistChannels', error)
    }
  }
}
