import type { AppError, ModMenuResult } from '../../shared/types'
import { AUTOMOD_SHOW_ICON, isAutomodIconType } from './automod-parser'
import { HiddenUsers, type HiddenUserEntry } from './hidden-users'
import { ModerationPrefetch, type ModerationPrefetchSession } from './moderation-prefetch'
import {
  extractModerateFromTree,
  extractRawModEndpoints,
  filterOnlyTimeDurations,
  type RawModEndpoint
} from './moderation-parser'

export interface ModerationSession extends ModerationPrefetchSession {
  modEndpointCache: Map<string, Map<string, RawModEndpoint>>
  poller?: {
    beginSendPriority(): void
    endSendPriority(): void
  } | null
}

export interface ModerationExecution {
  endpoint?: RawModEndpoint
  moderateData?: unknown
  needDurationPicker?: ModMenuResult
}
export interface ModerationContext {
  session(videoId: string): ModerationSession | undefined
  activeVideoId(): string | null
  fetchMenu(messageId: string, videoId: string): Promise<ModMenuResult>
  fetchContextMenuRaw(messageId: string, videoId: string): Promise<unknown>
  execute(apiUrl: string, body: Record<string, unknown>): Promise<unknown>
  performAction(messageId: string, iconType: string, videoId: string): Promise<unknown>
  resolveTimeoutDurations(
    messageId: string,
    endpoint: RawModEndpoint,
    videoId: string
  ): Promise<RawModEndpoint[]>
  error(code: AppError['code'], message: string): Error
  emitMenuReady?(menu: ModMenuResult & { videoId: string }): void
  emitHiddenUsers?(): void
}

export class ModerationService {
  private readonly hiddenUsers: HiddenUsers
  private readonly prefetch: ModerationPrefetch

  constructor(private readonly context: ModerationContext) {
    this.hiddenUsers = new HiddenUsers(() => this.context.emitHiddenUsers?.())
    this.prefetch = new ModerationPrefetch({
      getSession: (videoId) => this.context.session(videoId),
      fetchMenu: (messageId, videoId) => this.context.fetchMenu(messageId, videoId),
      onReady: (menu) => this.context.emitMenuReady?.(menu)
    })
  }

  queuePrefetch(messageId: string, videoId: string): void {
    this.prefetch.queue(messageId, videoId)
  }

  trackHiddenUser(
    channelId: string,
    name: string,
    messageId: string,
    videoId: string,
    hideParams?: string
  ): void {
    this.hiddenUsers.track(channelId, name, messageId, videoId, hideParams)
  }

  resolveUnhide(
    endpoints: RawModEndpoint[],
    channelId: string
  ): RawModEndpoint | null {
    return this.hiddenUsers.resolveUnhide(endpoints, channelId)
  }

  rememberUnhide(
    channelId: string,
    endpoint: RawModEndpoint,
    fallback: { name: string; messageId: string; videoId: string }
  ): void {
    this.hiddenUsers.rememberUnhide(channelId, endpoint, fallback)
  }

  clearHiddenUser(channelId: string): void {
    this.hiddenUsers.clear(channelId)
  }

  hiddenUser(channelId: string): HiddenUserEntry | undefined {
    return this.hiddenUsers.get(channelId)
  }

  hasHiddenUser(channelId: string): boolean {
    return this.hiddenUsers.has(channelId)
  }

  findHiddenChannelByMessage(messageId: string): string | undefined {
    return this.hiddenUsers.findChannelByMessage(messageId)
  }

  listHiddenUsers(): Array<{
    channelId: string
    name: string
    canUnhide: boolean
  }> {
    return this.hiddenUsers.list(this.context.activeVideoId())
  }

  async unhideUser(channelId: string): Promise<void> {
    const entry = this.hiddenUsers.get(channelId)
    if (!entry) {
      throw this.context.error(
        'UNKNOWN',
        'Usuario nao esta na lista de ocultados desta sessao.'
      )
    }
    if (entry.unhide) {
      this.cacheEndpoints(entry.messageId, [entry.unhide], entry.videoId)
      await this.context.performAction(
        entry.messageId,
        entry.unhide.iconType,
        entry.videoId
      )
      return
    }

    const session = this.context.session(entry.videoId)
    if (!session?.itemStore.has(entry.messageId)) {
      throw this.context.error(
        'CHAT_UNAVAILABLE',
        'Mensagem saiu do buffer e nao possui mais menu para desocultar.'
      )
    }
    const raw = await this.context.fetchContextMenuRaw(
      entry.messageId,
      entry.videoId
    )
    const endpoint = this.hiddenUsers.resolveUnhide(
      [...extractRawModEndpoints(raw), ...extractModerateFromTree(raw)],
      channelId
    )
    if (endpoint) {
      this.hiddenUsers.rememberUnhide(channelId, endpoint, entry)
      this.cacheEndpoints(entry.messageId, [endpoint], entry.videoId)
      await this.context.performAction(
        entry.messageId,
        endpoint.iconType,
        entry.videoId
      )
      return
    }

    const menu = await this.context.fetchMenu(entry.messageId, entry.videoId)
    const action = menu.actions.find((candidate) => candidate.kind === 'unhide')
    if (action) {
      await this.context.performAction(entry.messageId, action.iconType, entry.videoId)
      return
    }
    throw this.context.error(
      'UNKNOWN',
      'YouTube ainda nao enviou o endpoint para desocultar este usuario.'
    )
  }

  cacheEndpoints(
    messageId: string,
    endpoints: RawModEndpoint[],
    videoId: string
  ): void {
    const cache = this.context.session(videoId)?.modEndpointCache
    if (!cache) return
    const entries = cache.get(messageId) || new Map<string, RawModEndpoint>()
    for (const endpoint of endpoints) entries.set(endpoint.iconType, endpoint)
    cache.set(messageId, entries)
  }

  async runAction(
    messageId: string,
    iconType: string,
    videoId: string
  ): Promise<ModerationExecution> {
    const session = this.context.session(videoId)
    if (!session) {
      throw this.context.error('CHAT_UNAVAILABLE', 'Transmissao nao esta mais aberta.')
    }

    session.poller?.beginSendPriority()
    try {
      let endpoint = session.modEndpointCache.get(messageId)?.get(iconType)
      if (!endpoint && isAutomodIconType(iconType)) {
        throw this.context.error(
          'UNKNOWN',
          'Sem endpoint AutoMod (Mostrar/Ocultar) nesta mensagem.'
        )
      }
      if (!endpoint) {
        await this.context.fetchMenu(messageId, videoId)
        endpoint = session.modEndpointCache.get(messageId)?.get(iconType)
      }
      if (!endpoint) {
        throw this.context.error('UNKNOWN', `Acao nao encontrada: ${iconType}`)
      }

      if (
        iconType === 'TIMEOUT_MENU' ||
        (endpoint.kind === 'timeout' && endpoint.iconType === 'TIMEOUT_MENU')
      ) {
        let durations = filterOnlyTimeDurations([
          ...(session.modEndpointCache.get(messageId)?.values() || [])
        ])
        if (durations.length === 0) {
          durations = filterOnlyTimeDurations(
            await this.context.resolveTimeoutDurations(messageId, endpoint, videoId)
          )
          this.cacheEndpoints(messageId, durations, videoId)
        }
        if (durations.length === 0) {
          throw this.context.error('UNKNOWN', 'Nao achei opcoes de duracao do timeout.')
        }
        const actions = durations.map((duration) => ({
          iconType: duration.iconType,
          label: duration.label,
          kind: 'timeout' as const
        }))
        return {
          needDurationPicker: {
            messageId,
            actions,
            timeoutDurations: actions,
            canModerate: true
          }
        }
      }

      const needsDialog =
        endpoint.kind === 'timeout' &&
        !endpoint.apiUrl.includes('moderate') &&
        !endpoint.iconType.startsWith('TIMEOUT_')
      if (needsDialog) {
        const durations = await this.context.resolveTimeoutDurations(
          messageId,
          endpoint,
          videoId
        )
        if (durations.length === 0) {
          throw this.context.error('UNKNOWN', 'Nao achei opcoes de duracao do timeout.')
        }
        this.cacheEndpoints(messageId, durations, videoId)
        return {
          needDurationPicker: {
            messageId,
            actions: durations.map((duration) => ({
              iconType: duration.iconType,
              label: duration.label,
              kind: 'timeout' as const
            })),
            canModerate: true
          }
        }
      }

      const response = await this.context.execute(endpoint.apiUrl, {
        ...endpoint.body,
        parse: false
      })
      const result = response as { success?: boolean; status_code?: number }
      const status = result.status_code ?? (result.success === false ? 500 : 200)
      if (status >= 400) {
        throw this.context.error(
          'UNKNOWN',
          `YouTube recusou a moderacao (HTTP ${status})`
        )
      }
      if (isAutomodIconType(iconType) && iconType === AUTOMOD_SHOW_ICON) {
        return {
          endpoint,
          moderateData: (response as { data?: unknown }).data
        }
      }
      return { endpoint }
    } finally {
      session.poller?.endSendPriority()
    }
  }
}
