import { Innertube, YTNodes } from 'youtubei.js'
import {
  cookieDebugSummary,
  cookieHasSendAuth,
  collectYoutubeCookieString
} from '../auth'
import {
  buildLiveChatSendParams,
  prewarmYoutubeConnection
} from '../sending/fast-send'
import {
  parseSlowModeFromModeChange
} from '../sending/send-cooldown'
import {
  findChatItemWithMenuInResponse,
  isAutomodHeldItem,
  isAutomodIconType,
  parseAutomodHeldItem,
  type AutomodHeldParseResult
} from '../moderation/automod-parser'
import {
  InstantLiveChatPoller,
  type ModerationEventSource,
  type YtLiveEmoji
} from '../instant-chat'
import {
  ModerationEchoSuppressor,
  type IncomingModerationEvent
} from '../moderation/moderation-activity'
import {
  logExternalDelete,
  logIncomingModeration
} from '../moderation-logs/moderation-log-from-session'
import { applyLocalModResult } from '../moderation/apply-local-mod-result'
import {
  extractMenuParamsFromItem,
  extractModerateFromTree,
  extractRawModEndpoints,
  extractTimeoutDurations,
  filterOnlyTimeDurations,
  type RawModEndpoint
} from '../moderation/moderation-parser'
import { LiveStateService } from '../live/live-state-service'
import { LiveWatchController, type LiveWatchTab } from '../live/live-watch'
import {
  loadChannels,
  makeChannelKey,
  mapPool,
  pendingTabId,
  isPendingTabId,
  tabKeyFromPendingId,
  removeSavedChannel,
  saveChannels,
  upsertSavedChannel,
  type SavedChannel
} from './channels-store'
import type {
  AppError, ChannelTab, ChatMessage, ChatPart, ChatStatus,
  EmoteCatalog, ListChannelLivesResult, LivePinnedMessage, LivePollState,
  LiveSessionInfo, LiveStreamOption, ModMenuResult, UserProfile, YtChannelIdentity
} from '../../shared/types'
import {
  createChannelSession,
  type ChannelSession,
  type EmotesReadyHandler,
  type HiddenUsersHandler,
  type LiveChatHandle,
  type LivePollHandler,
  type MessageHandler,
  type ModMenuReadyHandler,
  type PinnedHandler,
  type RemovedHandler,
  type SessionsChangedHandler,
  type StatusHandler,
  type StoredChatItem
} from './chat-session'
import {
  fromMembership,
  fromPaidMessage,
  fromTextMessage,
  messagePartsFrom,
  pickEmojiUrl,
  plainFromParts,
  textOf
} from './message-parser'
import {
  isVideoId11,
  isVideoDefinitelyEnded as detailsAreDefinitelyEnded,
  isVideoLiveNow as detailsAreLiveNow,
  liveOptionFromNode,
  looksLive,
  looksUpcoming,
  normName,
  videoIdFromNode
} from './channel-parser'
import { MessageStore } from './message-store'
import { applyMemberBadgeCache } from './member-badge-cache'
import { SessionRegistry } from './session-registry'
import { EmoteService } from '../emotes/emote-service'
import {
  matchPendingEcho,
  MessageSender
} from '../sending/message-sender'
import { IdentityService } from '../auth/identity-service'
import {
  ChannelResolver,
  parseChannelInput
} from './channel-resolver'
import { SessionLifecycle } from './session-lifecycle'
import { compileModerationMenu } from '../moderation/moderation-menu'
import { AutomodService } from '../moderation/automod-service'
import { ModerationService } from '../moderation/moderation-service'
import { translateMain } from '../i18n/i18n-main'
import { ChannelActivityCoordinator } from '../channel-activity/channel-activity-coordinator'
const MAX_SESSIONS = 12

function defaultErrorMessageKey(code: AppError['code']): string {
  const keys: Record<AppError['code'], string> = {
    NOT_LOGGED_IN: 'errors.loginRequired',
    CHANNEL_NOT_FOUND: 'errors.channelNotFound',
    NOT_LIVE: 'errors.notLive',
    CHAT_UNAVAILABLE: 'errors.chatUnavailable',
    SEND_FAILED: 'errors.sendFailed',
    NETWORK_ERROR: 'errors.network',
    AUTH_FAILED: 'errors.authFailed',
    UNKNOWN: 'errors.unknown'
  }
  return keys[code]
}

export class ChatService {
  /** Registro unico das lives abertas e da aba ativa. */
  private readonly sessionRegistry = new SessionRegistry(MAX_SESSIONS)
  private readonly identityService = new IdentityService({
    stopLiveWatch: () => this.liveWatch.stop(),
    stopChat: () => this.stopChat(),
    stopAllPollers: () => this.stopAllPollers(),
    rejoinSessionsAfterAuth: () => this.rejoinSessionsAfterAuth(),
    clearChatState: () => {
      this.automodState.clear()
    }
  })
  private readonly channelResolver = new ChannelResolver({
    yt: () => this.yt,
    isLoggedIn: () => !!this.yt?.session.logged_in
  })
  private readonly sessionLifecycle = new SessionLifecycle({
    registry: this.sessionRegistry,
    canReadChat: () => !!this.yt,
    createSession: (info) => createChannelSession(info),
    openByChannel: (input, options) =>
      this.openByChannel(input, options),
    startLiveWatch: () => this.liveWatch.start(),
    canModerate: (session) => this.sessionCanModerate(session),
    emitSessions: (payload) => this.onSessionsChanged?.(payload),
    emitStatus: (status, error, videoId) =>
      this.onStatus?.(status, error, videoId)
  })
  private get yt(): Innertube | null {
    return this.identityService.getYt()
  }
  private get cookie(): string | null {
    return this.identityService.getCookie()
  }
  private get selfChannelId(): string | undefined {
    return this.identityService.getSelfChannelId()
  }
  private get selfName(): string | undefined {
    return this.identityService.getSelfName()
  }
  private get selfHandle(): string | undefined {
    return this.identityService.getSelfHandle()
  }
  private get onBehalfOfUser(): string | undefined {
    return this.identityService.getOnBehalfOfUser()
  }
  private readonly emoteService = new EmoteService({
    getSession: (videoId) => this.sessionRegistry.get(videoId),
    emitReady: (videoId) => this.onEmotesReady?.(videoId)
  })
  private readonly messageSender = new MessageSender({
    activeSession: () => this.active(),
    yt: () => this.yt,
    cookie: () => this.cookie,
    emit: (message, videoId) => this.emitChatMessage(message, videoId),
    emitSessions: () => this.emitSessions(),
    selfIdentity: () => ({
      name: this.selfDisplayName(),
      channelId: this.selfChannelId
    })
  })
  private get sessions(): Map<string, ChannelSession> {
    return this.sessionRegistry.storage()
  }
  private get activeVideoId(): string | null {
    return this.sessionRegistry.activeId()
  }
  private set activeVideoId(videoId: string | null) {
    this.sessionRegistry.setActive(videoId)
  }
  private onMessage: MessageHandler | null = null
  private onStatus: StatusHandler | null = null
  private onRemoved: RemovedHandler | null = null
  private onModMenuReady: ModMenuReadyHandler | null = null
  private onSessionsChanged: SessionsChangedHandler | null = null
  private onEmotesReady: EmotesReadyHandler | null = null
  private onHiddenUsersChanged: HiddenUsersHandler | null = null
  private onLivePoll: LivePollHandler | null = null
  private onPinnedMessage: PinnedHandler | null = null
  private moderationEchoSuppressor = new ModerationEchoSuppressor()
  private readonly confirmedExternalDeletes = new Set<string>()
  /** Metadados leves de mensagens e itens, isolados pela sessao atual. */
  private readonly messageStore = new MessageStore(() => this.sessionCtx())
  readonly channelActivity = new ChannelActivityCoordinator({
    session: (videoId) => this.sessions.get(videoId), execute: async (endpoint, payload) => { if (!this.yt) throw this.err('NOT_LOGGED_IN', 'Sessao invalida.'); return this.yt.actions.execute(endpoint, payload) },
    isSelfTarget: (target) => this.isSelfAuthor(target), selfActivityUnavailable: () => translateMain('channelActivity.selfUnavailable'), unavailable: (message) => this.err('UNKNOWN', message), resolveBrowseId: (handle) => this.channelResolver.resolveBrowseId(handle, false), canModerate: (session) => this.sessionCanModerate(session),
    runModAction: (messageId, iconType, videoId) => this.runModAction(messageId, iconType, videoId)
  })
  /**
   * AutoMod: conteÃºdo da msg retida (p/ â€œExibirâ€ promover a bolha normal).
   * Guarda videoId da live â€” sem isso o hide manda onRemoved sem canal e a UI
   * ignora (bolha retida fica visÃ­vel).
   */
  private readonly automodState = new AutomodService({
    cacheEndpoints: (messageId, endpoints, videoId) =>
      this.cacheEndpoints(messageId, endpoints, videoId),
    storeHeldSnapshot: (message) => {
      this.pruneHeldMessagesIfNeeded()
      this.storeChatItem(message.id, this.lightFromMessage(message, true))
    },
    storeModeratableItem: (realId, aliasId, rawItem, message) =>
      this.storeModeratableItem(realId, aliasId, rawItem, message),
    deleteEndpointCache: (messageId, videoId) =>
      this.sessions.get(videoId)?.modEndpointCache.delete(messageId),
    upgradeReleasedMenu: (message, videoId, rawItem) =>
      this.upgradeReleasedMenuIfNeeded(message, videoId, rawItem),
    deleteItem: (messageId, videoId) =>
      this.sessions.get(videoId)?.itemStore.delete(messageId),
    recoverMenu: (messageId, text, videoId) => {
      void this.recoverMenuAfterAutomodShow(messageId, text, videoId)
    },
    emitRemoved: (payload) => this.onRemoved?.(payload),
    activeVideoId: () => this.activeVideoId,
    emitMessage: (message, videoId) =>
      this.emitChatMessage(message, videoId)
  })
  /** Evita re-salvar em loop / aberturas paralelas no restore */
  private get restoringChannels(): boolean {
    return this.sessionLifecycle.isRestoring()
  }
  /** Abas offline â†’ reconecta na mesma tabKey quando a live sobe (ver live-watch.ts) */
  private readonly liveWatch = new LiveWatchController({
    canProbe: () => !!(this.cookie && this.yt?.session.logged_in),
    isBusy: () => this.restoringChannels,
    listTabs: () => this.liveWatchTabs(),
    resolveLiveVideoId: (h) => this.resolveLiveVideoIdForWatch(h),
    isVideoLive: (id) => this.isVideoLiveNow(id),
    isStreamEnded: (id) => this.isVideoStreamEnded(id),
    hasLivePoller: (id) => !!this.sessions.get(id)?.poller,
    markEnded: (id) => this.markSessionEnded(id),
    activeVideoId: () => this.activeVideoId,
    reopenOnSameTab: (videoId, opts) => this.openByChannel(videoId, opts).then(() => undefined)
  })
  /**
   * UsuÃ¡rios ocultados nesta sessÃ£o + endpoint de desocultar (quando o YT oferecer).
   * key = authorChannelId (UCâ€¦)
   */
  private readonly moderationService = new ModerationService({
    session: (videoId) => this.sessions.get(videoId),
    activeVideoId: () => this.activeVideoId,
    fetchMenu: (messageId, videoId) => this.fetchModMenu(messageId, videoId),
    fetchContextMenuRaw: (messageId, videoId) =>
      this.fetchContextMenuRaw(messageId, videoId),
    execute: async (apiUrl, body) => {
      if (!this.yt) throw this.err('NOT_LOGGED_IN', 'Sessao invalida.')
      return this.yt.actions.execute(apiUrl, body)
    },
    resolveTimeoutDurations: (messageId, endpoint, videoId) =>
      this.resolveTimeoutDurations(messageId, endpoint, videoId),
    performAction: (messageId, iconType, videoId) =>
      this.runModAction(messageId, iconType, videoId),
    error: (code, message) => this.err(code, message),
    emitMenuReady: (menu) => this.onModMenuReady?.(menu),
    emitHiddenUsers: () => this.emitHiddenUsers()
  })
  private readonly liveStateService = new LiveStateService({
    session: (videoId) => this.sessions.get(videoId),
    activeVideoId: () => this.activeVideoId,
    emitPoll: (poll) => this.onLivePoll?.(poll),
    emitPinned: (pin) => this.onPinnedMessage?.(pin),
    execute: async (apiUrl, body) => {
      if (!this.yt) throw this.err('NOT_LOGGED_IN', 'Sessao invalida.')
      return this.yt.actions.execute(apiUrl, body)
    },
    error: (code, message) => this.err(code, message)
  })

  setHandlers(handlers: {
    onMessage: MessageHandler
    onStatus: StatusHandler
    onRemoved?: RemovedHandler
    onModMenuReady?: ModMenuReadyHandler
    onSessionsChanged?: SessionsChangedHandler
    onEmotesReady?: EmotesReadyHandler
    onHiddenUsersChanged?: HiddenUsersHandler
    onLivePoll?: LivePollHandler
    onPinnedMessage?: PinnedHandler
  }): void {
    this.onMessage = handlers.onMessage
    this.onStatus = handlers.onStatus
    this.onRemoved = handlers.onRemoved || null
    this.onModMenuReady = handlers.onModMenuReady || null
    this.onSessionsChanged = handlers.onSessionsChanged || null
    this.onEmotesReady = handlers.onEmotesReady || null
    this.onHiddenUsersChanged = handlers.onHiddenUsersChanged || null
    this.onLivePoll = handlers.onLivePoll || null
    this.onPinnedMessage = handlers.onPinnedMessage || null
  }

  private emitHiddenUsers(): void {
    this.onHiddenUsersChanged?.(this.listHiddenUsers())
  }

  private rememberMessageAuthor(msg: ChatMessage): void {
    this.messageStore.rememberAuthor(msg)
  }

  private storeChatItem(
    messageId: string,
    stored: StoredChatItem,
    aliasId?: string
  ): void {
    this.messageStore.storeItem(messageId, stored, aliasId)
  }

  private lightFromRaw(
    rawItem: unknown,
    msg?: Pick<
      ChatMessage,
      'authorChannelId' | 'authorName' | 'text' | 'heldForReview'
    >
  ): StoredChatItem {
    return this.messageStore.lightFromRaw(rawItem, msg)
  }

  private lightFromMessage(
    msg: ChatMessage,
    isAutomodHeld = false
  ): StoredChatItem {
    return this.messageStore.lightFromMessage(msg, isAutomodHeld)
  }

  private pruneHeldMessagesIfNeeded(): void {
    this.messageStore.pruneHeldMessages(this.automodState.heldEntries())
  }

  private getDeletedMessageText(messageId: string): string {
    return this.messageStore.deletedText(messageId)
  }

  private active(): ChannelSession | null {
    return this.sessionRegistry.active()
  }

  private emitSessions(): void {
    this.sessionLifecycle.emitSessions()
  }

  private persistChannels(): void {
    this.sessionLifecycle.persistChannels()
  }

  private persistRemoveByVideoId(videoId: string): void {
    this.sessionLifecycle.persistRemoveByVideoId(videoId)
  }

  private sessionTabKey(session: ChannelSession): string {
    return this.sessionLifecycle.sessionTabKey(session)
  }

  private removeSessionsForTabKey(
    tabKey: string,
    exceptVideoId?: string
  ): void {
    this.sessionLifecycle.removeSessionsForTabKey(tabKey, exceptVideoId)
  }

  async restoreSavedChannels(): Promise<void> {
    await this.sessionLifecycle.restoreSavedChannels()
  }


  /** Snapshot p/ LiveWatchController */
  private liveWatchTabs(): LiveWatchTab[] {
    return [...this.sessions.values()].map((s) => ({
      videoId: s.info.videoId,
      status: s.status,
      hasPoller: !!s.poller,
      tabKey: this.sessionTabKey(s),
      info: {
        videoId: s.info.videoId,
        channelHandle: s.info.channelHandle,
        input: s.info.input,
        tabKey: s.info.tabKey,
        channelName: s.info.channelName
      }
    }))
  }

  private async resolveLiveVideoIdForWatch(handleOrId: string): Promise<string | null> {
    const isChannelId = /^UC[\w-]{20,}$/.test(handleOrId)
    const primary = await this.getPrimaryLiveVideoId(handleOrId, isChannelId)
    if (!primary) return null
    if (await this.isVideoLiveNow(primary)) return primary
    return null
  }

  private async isVideoLiveNow(videoId: string): Promise<boolean> {
    const info = await this.ensureYt().getBasicInfo(videoId)
    const details = info.basic_info as {
      is_live?: boolean; is_upcoming?: boolean; is_post_live_dvr?: boolean
    }
    const end = (info as unknown as { streaming_data?: { end_timestamp?: unknown } })
      .streaming_data?.end_timestamp
    return detailsAreLiveNow(details, end)
  }

  /** Live-watch: só encerra sessão se a live realmente acabou (não upcoming). */
  private async isVideoStreamEnded(videoId: string): Promise<boolean> {
    const info = await this.ensureYt().getBasicInfo(videoId)
    const details = info.basic_info as {
      is_live?: boolean; is_upcoming?: boolean; is_post_live_dvr?: boolean
    }
    const end = (info as unknown as { streaming_data?: { end_timestamp?: unknown } })
      .streaming_data?.end_timestamp
    return detailsAreDefinitelyEnded(details, end)
  }

  private markSessionEnded(videoId: string): void {
    const s = this.sessions.get(videoId)
    if (!s || s.status === 'ended') return
    s.status = 'ended'; s.info.isLive = false
    try { s.poller?.stop(); s.liveChat?.stop() } catch { /* encerrando */ }
    s.poller = null; s.liveChat = null
    this.onStatus?.('ended', undefined, videoId)
    this.emitSessions(); this.liveWatch.start()
  }

  private sessionCanModerate(s: ChannelSession): boolean {
    return !!(
      s.canModerate ||
      s.selfBadges.isModerator ||
      s.selfBadges.isOwner
    )
  }

  private requireSession(videoId: string): ChannelSession {
    const session = videoId ? this.sessionRegistry.get(videoId) : undefined
    if (!session) {
      throw this.err('CHAT_UNAVAILABLE', 'TransmissÃ£o nÃ£o estÃ¡ mais aberta.')
    }
    return session
  }

  getTabs(): ChannelTab[] {
    return this.sessionLifecycle.getTabs()
  }

  listSessions(): { tabs: ChannelTab[]; activeVideoId: string | null } {
    return this.sessionLifecycle.listSessions()
  }

  private createEmptySession(info: LiveSessionInfo): ChannelSession {
    return createChannelSession(info)
  }

  private applyYoutubeDefaultEmojis(
    videoId: string,
    emojis: YtLiveEmoji[]
  ): void {
    this.emoteService.applyYoutubeDefaults(videoId, emojis)
  }

  private loadSeventvForSession(
    videoId: string,
    youtubeChannelId: string | undefined
  ): void {
    this.emoteService.loadSeventv(videoId, youtubeChannelId)
  }

  getEmoteCatalog(videoId?: string | null): EmoteCatalog {
    return this.emoteService.catalog(videoId || this.activeVideoId)
  }

  private withSeventv(
    msg: ChatMessage,
    videoId?: string | null
  ): ChatMessage {
    const vid = videoId || this.handlingVideoId || this.activeVideoId
    return vid ? this.emoteService.apply(msg, vid) : msg
  }

  private emitChatMessage(msg: ChatMessage, videoId: string): void {
    this.rememberMessageAuthor(msg)
    this.onMessage?.(this.withSeventv(msg, videoId), videoId)
  }

  private destroySession(videoId: string): void {
    this.sessionLifecycle.destroySession(videoId)
  }

  async switchSession(videoId: string): Promise<LiveSessionInfo | null> {
    return this.sessionLifecycle.switchSession(videoId)
  }

  async closeSession(videoId: string): Promise<LiveSessionInfo | null> {
    return this.sessionLifecycle.closeSession(videoId)
  }

  private handlingVideoId: string | null = null

  private sessionCtx(): ChannelSession | null {
    if (this.handlingVideoId) {
      return this.sessions.get(this.handlingVideoId) || null
    }
    return this.active()
  }

  // Proxies â†’ sessÃ£o ativa / em handling (mantÃ©m o resto do cÃ³digo simples)
  private get liveChat(): LiveChatHandle | null {
    return this.sessionCtx()?.liveChat ?? null
  }
  private set liveChat(v: LiveChatHandle | null) {
    const s = this.sessionCtx()
    if (s) s.liveChat = v
  }
  private get poller(): InstantLiveChatPoller | null {
    return this.sessionCtx()?.poller ?? null
  }
  private set poller(v: InstantLiveChatPoller | null) {
    const s = this.sessionCtx()
    if (s) s.poller = v
  }
  private get pendingSends(): Array<{ id: string; text: string; at: number }> {
    return this.sessionCtx()?.pendingSends ?? []
  }
  private set pendingSends(v: Array<{ id: string; text: string; at: number }>) {
    const s = this.sessionCtx()
    if (s) s.pendingSends = v
  }
  private get itemStore(): Map<string, StoredChatItem> {
    return this.sessionCtx()?.itemStore ?? new Map()
  }
  private get modMenuCache(): Map<string, ModMenuResult> {
    return this.sessionCtx()?.modMenuCache ?? new Map()
  }
  private get modEndpointCache(): Map<string, Map<string, RawModEndpoint>> {
    return this.sessionCtx()?.modEndpointCache ?? new Map()
  }
  private get modPrefetchQueue(): string[] {
    return this.sessionCtx()?.modPrefetchQueue ?? []
  }
  private set modPrefetchQueue(v: string[]) {
    const s = this.sessionCtx()
    if (s) s.modPrefetchQueue = v
  }
  private get modPrefetchInFlight(): Set<string> {
    return this.sessionCtx()?.modPrefetchInFlight ?? new Set()
  }
  private get modPrefetchActive(): number {
    return this.sessionCtx()?.modPrefetchActive ?? 0
  }
  private set modPrefetchActive(v: number) {
    const s = this.sessionCtx()
    if (s) s.modPrefetchActive = v
  }
  private get sendVideoId(): string | null {
    return this.sessionCtx()?.sendVideoId ?? null
  }
  private set sendVideoId(v: string | null) {
    const s = this.sessionCtx()
    if (s) s.sendVideoId = v
  }
  private get sendChannelId(): string | null {
    return this.sessionCtx()?.sendChannelId ?? null
  }
  private set sendChannelId(v: string | null) {
    const s = this.sessionCtx()
    if (s) s.sendChannelId = v
  }
  private get sendParams(): string | null {
    return this.sessionCtx()?.sendParams ?? null
  }
  private set sendParams(v: string | null) {
    const s = this.sessionCtx()
    if (s) s.sendParams = v
  }
  private get sendInFlight(): number {
    return this.sessionCtx()?.sendInFlight ?? 0
  }
  private set sendInFlight(v: number) {
    const s = this.sessionCtx()
    if (s) s.sendInFlight = v
  }

  private selfDisplayName(): string {
    if (this.selfHandle) {
      const h = this.selfHandle.startsWith('@') ? this.selfHandle : `@${this.selfHandle}`
      return h
    }
    return this.selfName || ''
  }

  /** @nome (com @ se ainda nÃ£o tiver) */
  private asAtName(name: string): string {
    const n = (name || '').trim()
    if (!n) return '@alguÃ©m'
    return n.startsWith('@') ? n : `@${n}`
  }

  private emitModSystemMessage(
    videoId: string,
    opts: {
      systemKind: NonNullable<ChatMessage['systemKind']>
      /** Texto da aÃ§Ã£o sem nomes (ex.: "Mensagem apagada") */
      systemTargetChannelId?: string
      systemTargetName?: string
      systemModeratorName?: string
      systemDurationKey?: string
      systemDeletedText?: string
      systemSourceMessageId?: string
      replacesId?: string
      id?: string
    }
  ): void {
    const vid = videoId || this.activeVideoId || ''
    if (!vid) return
    const msg: ChatMessage = {
      id:
        opts.id ||
        `sys-${opts.systemKind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      authorName: '',
      text: '',
      timestamp: Date.now(),
      systemKind: opts.systemKind,
      systemTargetChannelId: opts.systemTargetChannelId,
      systemTargetName: opts.systemTargetName,
      systemModeratorName: opts.systemModeratorName || this.selfDisplayName(),
      systemDurationKey: opts.systemDurationKey,
      systemDeletedText: opts.systemDeletedText,
      systemSourceMessageId: opts.systemSourceMessageId,
      replacesId: opts.replacesId,
      hasContextMenu: false
    }
    this.emitChatMessage(msg, vid)
  }

  private handleIncomingModerationEvent(
    event: IncomingModerationEvent,
    videoId: string,
    source: ModerationEventSource = 'live'
  ): void {
    const vid = videoId || this.activeVideoId || ''
    if (!vid) return
    const receivedAt = Date.now(); const moderatedThrough = source === 'live' ? receivedAt : event.timestamp || receivedAt
    const sourceMeta = event.messageId ? this.messageStore.findAuthor(event.messageId) : undefined
    const stored = event.messageId ? this.itemStore.get(event.messageId) : undefined
    const targetName = event.targetName || sourceMeta?.name || stored?.authorName
    const targetChannelId = event.authorChannelId || sourceMeta?.channelId || stored?.authorChannelId
    const resolvedEvent = { ...event, targetName, authorChannelId: targetChannelId, timestamp: moderatedThrough }
    if (this.moderationEchoSuppressor.shouldSuppress(vid, resolvedEvent)) return
    this.markSessionCanModerate(vid)
    const deletedText = sourceMeta?.text?.trim() || stored?.text?.trim() || ''
    if (source === 'live') {
      logIncomingModeration(this.sessions.get(vid), resolvedEvent, this.messageStore)
    }
    if (event.kind === 'hide' && event.authorChannelId) {
      let sourceMessageId = ''
      for (const [messageId, author] of this.messageStore.authorEntries()) {
        if (author.channelId === event.authorChannelId) {
          sourceMessageId = messageId
          break
        }
      }
      this.trackHiddenUser(
        event.authorChannelId,
        event.targetName || event.authorChannelId,
        sourceMessageId || event.rendererId || '',
        vid
      )
    }
    if (event.kind === 'delete' && event.messageId) {
      const deleteKey = `${vid}:${event.messageId}`
      this.confirmedExternalDeletes.add(deleteKey)
      if (this.confirmedExternalDeletes.size > 2_000) {
        const oldest = this.confirmedExternalDeletes.values().next().value
        if (oldest) this.confirmedExternalDeletes.delete(oldest)
      }
      this.onRemoved?.({ messageId: event.messageId, videoId: vid })
    } else if (targetChannelId) {
      this.onRemoved?.({
        authorChannelId: targetChannelId,
        videoId: vid,
        moderatedThrough
      })
    }
    if (source === 'bootstrap' && event.kind === 'delete') return
    const message: ChatMessage = {
      id:
        event.rendererId ||
        `yt-mod-${event.kind}-${event.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      authorName: '',
      text: event.text,
      timestamp: moderatedThrough,
      systemKind: event.kind === 'timeout' ? 'mod-timeout' : event.kind === 'delete' ? 'mod-delete' : 'mod-hide',

      systemTargetChannelId: targetChannelId,
      systemTargetName: targetName,
      systemModeratorName: event.moderatorName,
      systemDurationKey:
        event.kind === 'timeout' && event.durationSeconds !== undefined
          ? `${event.durationSeconds}s`
          : undefined,
      systemDeletedText: event.kind === 'delete' ? deletedText || '(sem texto)' : undefined,
      systemSourceMessageId: event.kind === 'delete' ? event.messageId : undefined,
      systemHistorical: source === 'bootstrap',
      replacesId: event.kind === 'delete' ? event.messageId : undefined,
      hasContextMenu: false
    }
    this.emitChatMessage(message, vid)
    console.log('[mod-activity]', {
      kind: event.kind,
      source,
      durationSeconds: event.durationSeconds,
      hasAuthorChannelId: !!event.authorChannelId
    })
  }

  private isSelfAuthor(msg: Pick<ChatMessage, 'authorChannelId' | 'authorName'>): boolean {
    if (this.selfChannelId && msg.authorChannelId && msg.authorChannelId === this.selfChannelId) {
      return true
    }
    const author = normName(msg.authorName || '')
    if (!author) return false
    if (this.selfHandle && author === normName(this.selfHandle)) return true
    if (this.selfName && author === normName(this.selfName)) return true
    return false
  }

  /** Atualiza badges da conta SÃ“ nesta sessÃ£o/canal (eco do YT) */
  private rememberSelfBadges(msg: ChatMessage, videoId?: string | null): void {
    if (!msg.isSelf && !this.isSelfAuthor(msg)) return
    // Com channelId conhecido, exige match â€” evita â€œmesmo nickâ€ de outro virar mod
    if (
      this.selfChannelId &&
      msg.authorChannelId &&
      msg.authorChannelId !== this.selfChannelId
    ) {
      return
    }
    const vid = videoId || this.handlingVideoId || this.activeVideoId
    if (!vid) return
    const s = this.sessions.get(vid)
    if (!s) return
    const before = this.sessionCanModerate(s)
    // SÃ³ â€œligaâ€ flags conhecidas neste canal (nÃ£o desliga se uma msg vier sem badge)
    if (msg.isModerator) s.selfBadges.isModerator = true
    if (msg.isMember) s.selfBadges.isMember = true
    if (msg.memberBadgeUrl) s.selfBadges.memberBadgeUrl = msg.memberBadgeUrl
    if (msg.memberBadgeLabel) s.selfBadges.memberBadgeLabel = msg.memberBadgeLabel
    if (msg.isOwner) s.selfBadges.isOwner = true
    if (msg.isVerified) s.selfBadges.isVerified = true
    // canModerate sÃ³ com badge MOD/OWNER nesta live (nÃ£o por menu pessoal)
    if (s.selfBadges.isModerator || s.selfBadges.isOwner) {
      s.canModerate = true
    }
    if (!before && this.sessionCanModerate(s)) {
      this.emitSessions()
    }
  }

  /** Marca sessÃ£o como moderÃ¡vel (menu de mod confirmou aÃ§Ãµes). */
  private markSessionCanModerate(videoId?: string | null): void {
    const vid = videoId || this.handlingVideoId || this.activeVideoId
    if (!vid) return
    const s = this.sessions.get(vid)
    if (!s || s.canModerate) return
    s.canModerate = true
    this.emitSessions()
  }

  private trackHiddenUser(
    channelId: string,
    name: string,
    messageId: string,
    videoId: string,
    hideParams?: string
  ): void {
    this.moderationService.trackHiddenUser(
      channelId,
      name,
      messageId,
      videoId,
      hideParams
    )
  }

  /**
   * Dado o menu + estado "jÃ¡ ocultamos este autor", resolve o endpoint de unhide.
   * O YT em EN Ã s vezes mantÃ©m o label "Hide userâ€¦" no unhide com params diferentes.
   */
  private resolveUnhideFromEndpoints(
    endpoints: RawModEndpoint[],
    channelId: string,
    messageId: string
  ): RawModEndpoint | null {
    void messageId
    return this.moderationService.resolveUnhide(endpoints, channelId)
  }

  private clearHiddenUser(channelId: string): void {
    this.moderationService.clearHiddenUser(channelId)
  }

  private rememberUnhideEndpoint(
    messageId: string,
    ep: RawModEndpoint,
    channelIdHint?: string,
    videoId?: string
  ): void {
    const stored = videoId
      ? this.sessions.get(videoId)?.itemStore.get(messageId)
      : this.itemStore.get(messageId)
    const meta = this.messageStore.findAuthor(messageId)
    const ch =
      channelIdHint || stored?.authorChannelId || meta?.channelId
    if (!ch) return
    const name =
      stored?.authorName ||
      meta?.name ||
      this.moderationService.hiddenUser(ch)?.name ||
      ch
    const vid = videoId || this.handlingVideoId || this.activeVideoId || ''
    this.moderationService.rememberUnhide(
      ch,
      ep,
      { name, messageId, videoId: vid }
    )
    // TambÃ©m no cache do messageId p/ runModAction
    this.cacheEndpoints(messageId, [ep], videoId)
  }

  private findHiddenChannelByMessage(messageId: string): string | undefined {
    return this.moderationService.findHiddenChannelByMessage(messageId)
  }

  /** Lista ocultados da live ativa (p/ UI). */
  listHiddenUsers(): Array<{
    channelId: string
    name: string
    canUnhide: boolean
  }> {
    return this.moderationService.listHiddenUsers()
  }

  /**
   * Desocultar por channelId (usa endpoint capturado no menu do YT).
   */
  async unhideUser(channelId: string): Promise<void> {
    await this.moderationService.unhideUser(channelId)
  }

  /** Aplica badges cacheados DESTE canal (nunca de outro) */
  private applySelfBadges(msg: ChatMessage, videoId?: string | null): ChatMessage {
    const vid = videoId || this.handlingVideoId || this.activeVideoId
    const badges = vid ? this.sessions.get(vid)?.selfBadges : undefined
    if (!badges) return msg
    return {
      ...msg,
      isModerator: !!(msg.isModerator || badges.isModerator),
      isMember: !!(msg.isMember || badges.isMember),
      memberBadgeUrl: msg.memberBadgeUrl || badges.memberBadgeUrl,
      memberBadgeLabel: msg.memberBadgeLabel || badges.memberBadgeLabel,
      isOwner: !!(msg.isOwner || badges.isOwner),
      isVerified: !!(msg.isVerified || badges.isVerified)
    }
  }

  /**
   * Eco do nosso envio otimista â†’ mesma bolha, mas com id REAL do YouTube
   * (senÃ£o o â‹® de moderaÃ§Ã£o nunca aparece: menu fica no id do servidor).
   */
  private absorbIfPendingEcho(msg: ChatMessage, rawItem?: unknown): boolean {
    const now = Date.now()
    this.pendingSends = this.pendingSends.filter((p) => now - p.at < 45_000)

    const candidate = this.pendingSends.find(
      (p) => p.text === msg.text && now - p.at < 45_000
    )
    if (!candidate) return false

    if (!msg.isSelf && !this.isSelfAuthor(msg)) {
      if (now - candidate.at > 25_000) return false
    }

    const pending = matchPendingEcho(this.pendingSends, msg.text, now)
    if (!pending) return false

    const light = rawItem ? this.lightFromRaw(rawItem, msg) : this.lightFromMessage(msg)
    const hasMenu = !!light.menuParams || !!msg.hasContextMenu

    // Guarda snapshot leve no id real E no local (mod menu funciona com qualquer um)
    const vid = this.handlingVideoId || this.activeVideoId || ''
    if (hasMenu) {
      this.storeChatItem(msg.id, light, pending.id)
      // Prefetch sÃ³ do prÃ³prio envio (nÃ£o em cada msg do chat â€” vaza RAM em flood)
      if (vid) this.queueModPrefetch(msg.id, vid)
    }

    const merged = this.applySelfBadges(
      {
        ...msg,
        id: msg.id,
        replacesId: pending.id,
        isSelf: true,
        pending: false,
        failed: false,
        awaitingEcho: false,
        hasContextMenu: hasMenu
      },
      vid
    )
    this.rememberSelfBadges(merged, vid)
    this.emitChatMessage(merged, vid)
    return true
  }

  getOnBehalfOfUser(): string | undefined {
    return this.identityService.getOnBehalfOfUser()
  }

  getActiveIdentityId(): string | undefined {
    return this.identityService.getActiveIdentityId()
  }

  async initGuest(): Promise<void> {
    return this.identityService.initGuest()
  }

  async initWithCookie(
    cookie: string | null,
    opts?: { onBehalfOfUser?: string; identityId?: string }
  ): Promise<UserProfile | null> {
    return this.identityService.initWithCookie(cookie, opts)
  }

  async listChannelIdentities(): Promise<YtChannelIdentity[]> {
    return this.identityService.listChannelIdentities()
  }

  async switchChannelIdentity(
    identityId: string
  ): Promise<UserProfile | null> {
    return this.identityService.switchChannelIdentity(identityId)
  }

  hadRemoteProfile(): boolean {
    return this.identityService.hadRemoteProfile()
  }

  async validateSessionAuth(): Promise<{ ok: boolean; reason: string }> {
    return this.identityService.validateSessionAuth()
  }

  async refreshAuthCookie(): Promise<boolean> {
    return this.identityService.refreshAuthCookie()
  }

  async fetchProfile(): Promise<UserProfile | null> {
    return this.identityService.fetchProfile()
  }

  async clear(): Promise<void> {
    await this.identityService.clear()
  }

  private isUnauthError(error: unknown): boolean {
    return this.identityService.isUnauthError(error)
  }

  private ensureYt(): Innertube {
    if (!this.yt) {
      throw this.err('NOT_LOGGED_IN', 'FaÃ§a login com o YouTube primeiro.')
    }
    return this.yt
  }

  private err(
    code: AppError['code'],
    message: string,
    messageKey = defaultErrorMessageKey(code),
    params?: Record<string, string | number>
  ): AppError & Error {
    const e = new Error(message) as Error & AppError
    e.code = code
    e.message = message
    e.messageKey = messageKey
    e.params = params
    return e
  }

  private parseChannelInput(input: string) {
    return parseChannelInput(input)
  }

  private resolveBrowseId(
    handleOrId: string,
    isChannelId: boolean
  ): Promise<string> {
    return this.channelResolver.resolveBrowseId(handleOrId, isChannelId)
  }

  private listLivesForChannel(
    handleOrId: string,
    isChannelId: boolean
  ): Promise<LiveStreamOption[]> {
    return this.channelResolver.listLivesForChannel(handleOrId, isChannelId)
  }

  private getPrimaryLiveVideoId(
    handleOrId: string,
    isChannelId: boolean
  ): Promise<string | null> {
    return this.channelResolver.getPrimaryLiveVideoId(handleOrId, isChannelId)
  }

  private getVideoIdFromChannel(
    handleOrId: string,
    isChannelId: boolean
  ): Promise<string> {
    return this.channelResolver.getVideoIdFromChannel(handleOrId, isChannelId)
  }

  private async addOfflineChannelTab(opts: {
    input: string
    handle?: string
    channelId?: string
    channelName?: string
    activate?: boolean
    quietStatus?: boolean
    tabKey?: string
  }): Promise<LiveSessionInfo> {
    const handle = opts.handle?.replace(/^@/, '') || undefined
    const tabKey =
      opts.tabKey ||
      (handle
        ? `h:${handle.toLowerCase()}`
        : opts.channelId
          ? `c:${opts.channelId}`
          : makeChannelKey({ channelHandle: handle, input: opts.input }))

    for (const s of this.sessions.values()) {
      if (this.sessionTabKey(s) === tabKey) {
        s.status = 'ended'
        s.info.isLive = false
        if (s.info.videoId.startsWith('pending:') || s.info.title.startsWith('Conectando')) s.info.title = 'Offline'
        if (opts.activate !== false) this.activeVideoId = s.info.videoId
        this.emitSessions()
        if (opts.activate !== false && !opts.quietStatus) this.onStatus?.('ended', undefined, s.info.videoId)
        console.log(`[chat-service] canal offline jÃ¡ na lista: ${tabKey}`)
        return s.info
      }
    }

    // Nome amigÃ¡vel (best-effort)
    let channelName = opts.channelName || handle || opts.input
    if (handle || opts.channelId) {
      try {
        const browseId = await this.resolveBrowseId(
          handle || opts.channelId!,
          !!opts.channelId && !handle
        )
        const ch = await this.ensureYt().getChannel(browseId)
        const title = textOf(
          (ch.metadata as { title?: unknown } | undefined)?.title
        )
        if (title) channelName = title
      } catch {
        /* nome genÃ©rico ok */
      }
    }

    const pid = pendingTabId(tabKey)
    const info: LiveSessionInfo = {
      videoId: pid,
      title: 'Offline',
      channelName,
      channelHandle: handle,
      input: handle ? `@${handle}` : opts.input,
      isLive: false,
      tabKey
    }
    const session = this.createEmptySession(info)
    session.status = 'ended'
    this.sessionRegistry.add(session)

    // Limite de abas
    if (this.sessions.size > MAX_SESSIONS) {
      const oldest = [...this.sessions.keys()].find((id) => id !== pid)
      if (oldest) {
        this.persistRemoveByVideoId(oldest)
        this.destroySession(oldest)
      }
    }

    if (opts.activate !== false) {
      this.activeVideoId = pid
      if (!opts.quietStatus) {
        this.onStatus?.('ended', undefined, pid)
      }
    }
    this.emitSessions()
    this.persistChannels()
    this.liveWatch.start()
    console.log(`[chat-service] canal adicionado offline: ${tabKey} (${channelName})`)
    return info
  }

  /**
   * Lista lives do canal p/ o UI escolher quando hÃ¡ mais de uma.
   * Se o input jÃ¡ for um vÃ­deo, devolve directVideoId.
   */
  async listChannelLives(input: string): Promise<ListChannelLivesResult> {
    return this.channelResolver.listChannelLives(input)
  }

  async openByChannel(
    input: string,
    opts?: import('../../shared/types').OpenChannelOpts
  ): Promise<LiveSessionInfo> {
    const activate = opts?.activate !== false
    const quietStatus = opts?.quietStatus === true
    // NÃƒO fecha outras lives â€” multi-canal
    if (activate && !quietStatus) {
      this.onStatus?.('connecting')
    }

    try {
      if (!this.cookie || !cookieHasSendAuth(this.cookie)) {
        const fresh = await collectYoutubeCookieString()
        if (fresh && cookieHasSendAuth(fresh)) {
          await this.initWithCookie(fresh)
        }
      }

      const yt = this.ensureYt()
      if (!this.cookie || !cookieHasSendAuth(this.cookie)) {
        console.warn(
          '[chat-service] abrindo chat com auth fraca â€” leitura ok, envio pode falhar 401',
          cookieDebugSummary(this.cookie)
        )
      }

      const parsed = this.parseChannelInput(input)
      let videoId: string

      // Handle/meta antecipado â€” se nÃ£o houver live, ainda assim adiciona a aba
      let channelHandleEarly =
        opts?.channelHandle?.replace(/^@/, '') ||
        (parsed.kind === 'handle' ? parsed.value : undefined)
      if (!channelHandleEarly && opts?.sourceInput) {
        try {
          const src = this.parseChannelInput(opts.sourceInput)
          if (src.kind === 'handle') channelHandleEarly = src.value
        } catch {
          /* ignore */
        }
      }

      if (parsed.kind === 'video') {
        videoId = parsed.value
      } else if (parsed.kind === 'channelId') {
        try {
          videoId = await this.getVideoIdFromChannel(parsed.value, true)
        } catch (e) {
          if ((e as AppError).code === 'NOT_LIVE') {
            return await this.addOfflineChannelTab({
              input: (opts?.sourceInput || input).trim(),
              channelId: parsed.value,
              handle: channelHandleEarly,
              activate: opts?.activate !== false,
              quietStatus: opts?.quietStatus === true,
              tabKey: opts?.tabKey
            })
          }
          throw e
        }
      } else {
        try {
          videoId = await this.getVideoIdFromChannel(parsed.value, false)
        } catch (first) {
          if ((first as AppError).code === 'NOT_LIVE') {
            return await this.addOfflineChannelTab({
              input: (opts?.sourceInput || input).trim(),
              handle: channelHandleEarly || parsed.value,
              activate: opts?.activate !== false,
              quietStatus: opts?.quietStatus === true,
              tabKey: opts?.tabKey
            })
          }
          if (/^[a-zA-Z0-9_-]{11}$/.test(parsed.value)) {
            videoId = parsed.value
          } else {
            throw first
          }
        }
      }

      // Handle/meta do canal (mesmo abrindo por videoId) â€” p/ â€œoutras livesâ€
      let channelHandle =
        channelHandleEarly ||
        opts?.channelHandle?.replace(/^@/, '') ||
        (parsed.kind === 'handle' ? parsed.value : undefined)
      if (!channelHandle && opts?.sourceInput) {
        try {
          const src = this.parseChannelInput(opts.sourceInput)
          if (src.kind === 'handle') channelHandle = src.value
        } catch {
          /* ignore */
        }
      }
      const sourceInput = (opts?.sourceInput || input).trim()
      // Trocar live do mesmo canal â†’ 1 aba (chave por @handle), nÃ£o nova aba v:
      const replacing =
        !!opts?.replaceVideoId || opts?.replaceSameChannel === true
      const preferVideoTab =
        !replacing &&
        (opts?.preferVideoTab === true || parsed.kind === 'video')
      const resolvedTabKey =
        opts?.tabKey ||
        (replacing && channelHandle
          ? `h:${channelHandle.toLowerCase()}`
          : preferVideoTab
            ? `v:${videoId}`
            : makeChannelKey({
                channelHandle,
                input: sourceInput,
                videoId
              }))

      // Substitui aba(s) do mesmo canal antes de abrir a nova live
      if (opts?.replaceVideoId && opts.replaceVideoId !== videoId) {
        console.log(
          `[chat-service] replace tab ${opts.replaceVideoId.slice(0, 10)}â€¦ â†’ ${videoId.slice(0, 10)}â€¦`
        )
        this.persistRemoveByVideoId(opts.replaceVideoId)
        this.destroySession(opts.replaceVideoId)
      }
      if (opts?.replaceSameChannel && channelHandle) {
        const h = channelHandle.toLowerCase()
        for (const [vid, sess] of [...this.sessions.entries()]) {
          if (vid === videoId) continue
          const sh = sess.info.channelHandle?.replace(/^@/, '').toLowerCase()
          const sameHandle = sh === h
          const sameInput =
            !!sourceInput &&
            (sess.info.input || '')
              .toLowerCase()
              .includes(h)
          if (sameHandle || sameInput || this.sessionTabKey(sess) === `h:${h}`) {
            console.log(
              `[chat-service] replaceSameChannel fecha ${vid.slice(0, 10)}â€¦`
            )
            this.persistRemoveByVideoId(vid)
            this.destroySession(vid)
          }
        }
      }

      // JÃ¡ aberta â†’ sÃ³ troca a aba ativa (opcional)
      const existing = this.sessions.get(videoId)
      if (existing?.poller) {
        if (activate) this.activeVideoId = videoId
        // atualiza meta do canal (p/ listar outras lives)
        if (sourceInput && (!existing.info.input || /^[a-zA-Z0-9_-]{11}$/.test(existing.info.input))) {
          existing.info.input = sourceInput
        }
        if (channelHandle && !existing.info.channelHandle) {
          existing.info.channelHandle = channelHandle
        }
        existing.info.tabKey = resolvedTabKey
        // limpa placeholder do mesmo canal
        if (opts?.replacePending !== false) {
          this.removeSessionsForTabKey(resolvedTabKey, videoId)
        }
        this.emitSessions()
        if (activate && !quietStatus) {
          this.onStatus?.(existing.status, undefined, videoId)
        }
        this.persistChannels()
        console.log(`[chat-service] switch aba existente ${videoId}`)
        return existing.info
      }

      // Link direto (inclui nÃ£o listado): getInfo com cookies da conta logada
      // (sÃ³ remove placeholder DEPOIS do sucesso â€” senÃ£o a aba some da lista)
      let info
      try {
        info = await yt.getInfo(videoId)
      } catch (e) {
        console.warn('[chat-service] getInfo failed, tentando getBasicInfo', e)
        // Brand pageId morto (ex.: canal deslogado) â†’ 401 em next/player
        if (this.isUnauthError(e) && this.onBehalfOfUser) {
          throw this.err(
            'NOT_LOGGED_IN',
            'SessÃ£o deste canal Brand invÃ¡lida (401). Troque para outro canal da conta ou faÃ§a login de novo.'
          )
        }
        try {
          info = await yt.getBasicInfo(videoId)
        } catch (e2) {
          if (this.isUnauthError(e2)) {
            throw this.err(
              'NOT_LOGGED_IN',
              'YouTube recusou a autenticaÃ§Ã£o (401). Saia da conta e entre de novo.'
            )
          }
          throw this.err(
            'CHAT_UNAVAILABLE',
            'NÃ£o foi possÃ­vel abrir este vÃ­deo. Confira o link e se sua conta tem acesso (nÃ£o listado / privado).'
          )
        }
      }

      const basic = info.basic_info
      const livechatNode = info.livechat as
        | { continuation?: string; is_replay?: boolean }
        | null
        | undefined

      // Aceita live ao vivo, unlisted, ou replay â€” basta ter chat/continuation
      if (!livechatNode?.continuation) {
        throw this.err(
          'CHAT_UNAVAILABLE',
          'Este link nÃ£o tem chat de live disponÃ­vel. Use o link da transmissÃ£o (ao vivo, unlisted ou com replay de chat).'
        )
      }

      // Replay sÃ³ se o YouTube marcar is_replay; unlisted ao vivo usa get_live_chat normal
      const isReplay = livechatNode.is_replay === true
      const isLive = basic.is_live === true || (!isReplay && basic.is_live !== false)

      console.log(
        `[chat-service] open videoId=${videoId} is_live=${String(basic.is_live)} is_replay=${String(livechatNode.is_replay)} via=${parsed.kind}`
      )

      // Troca placeholder / live antiga pelo videoId real (lista jÃ¡ estava visÃ­vel)
      this.removeSessionsForTabKey(resolvedTabKey, videoId)
      if (!this.restoringChannels) {
        for (const [vid, sess] of [...this.sessions.entries()]) {
          if (vid === videoId) continue
          const k = this.sessionTabKey(sess)
          if (k === resolvedTabKey && (k.startsWith('h:') || k.startsWith('c:'))) {
            console.log(`[chat-service] substituindo live antiga ${vid} â†’ ${videoId}`)
            this.destroySession(vid)
          }
        }
      }

      // Limite de abas
      if (this.sessions.size >= MAX_SESSIONS && !this.sessions.has(videoId)) {
        const oldest = this.sessions.keys().next().value
        if (oldest && oldest !== this.activeVideoId) this.destroySession(oldest)
        else if (oldest) this.destroySession(oldest)
      }

      const sessionInfo: LiveSessionInfo = {
        videoId,
        title: basic.title || 'Live',
        channelName: basic.author || parsed.value,
        channelHandle,
        // Guarda @canal mesmo se abriu por videoId (trocar live depois)
        input: sourceInput,
        isLive: isLive && !isReplay,
        isReplay,
        tabKey: resolvedTabKey
      }

      // Cria sessÃ£o; ativa sÃ³ se pedido (restore paralelo nÃ£o rouba o foco)
      const session = this.createEmptySession(sessionInfo)
      this.sessionRegistry.add(session)
      if (activate) {
        this.activeVideoId = videoId
      } else if (
        this.activeVideoId &&
        isPendingTabId(this.activeVideoId) &&
        this.activeVideoId === pendingTabId(resolvedTabKey)
      ) {
        // placeholder desta aba era o ativo â†’ promove
        this.activeVideoId = videoId
      }
      this.handlingVideoId = videoId

      try {
        this.liveChat = info.getLiveChat() as unknown as LiveChatHandle
      } catch {
        this.liveChat = null
      }

      this.sendVideoId = videoId
      // channel_id pode vir em campos diferentes conforme o parse do youtubei
      const basicAny = basic as {
        channel_id?: string
        channel_url?: string
        author?: string
      }
      let channelId =
        basicAny.channel_id ||
        this.selfChannelId ||
        ''
      if (!channelId && basicAny.channel_url) {
        const m = String(basicAny.channel_url).match(/(UC[\w-]{20,})/)
        if (m) channelId = m[1]
      }
      this.sendChannelId = channelId
      try {
        // Sempre monta params se tiver canal (mesmo unlisted / is_live ambÃ­guo)
        // Antes: sÃ³ isLive â†’ sendParams null â†’ fallback youtubei ~1.2s
        if (this.sendChannelId) {
          this.sendParams = buildLiveChatSendParams(videoId, this.sendChannelId)
          console.log(
            `[chat-service] send pronto video=${videoId} channel=${this.sendChannelId} isLive=${isLive} paramsLen=${this.sendParams.length}`
          )
        } else {
          this.sendParams = null
          console.warn(
            '[chat-service] sem channel_id â€” envio usarÃ¡ fallback youtubei (mais lento)'
          )
        }
      } catch (e) {
        console.warn('[chat-service] buildSendParams failed', e)
        this.sendParams = null
      }

      // 7TV: global + canal YouTube (path REST "google" + UCâ€¦)
      session.youtubeChannelId = this.sendChannelId || undefined
      this.loadSeventvForSession(videoId, this.sendChannelId || undefined)

      if (this.cookie) void prewarmYoutubeConnection(this.cookie)
      const initialCont = livechatNode.continuation
      const vid = videoId
      this.poller = new InstantLiveChatPoller(
        yt,
        initialCont,
        {
          onStart: () => {
            const s = this.sessions.get(vid)
            if (s) s.status = 'live'
            // Relogar / reabrir chat â†’ fixado pode voltar a aparecer
            this.clearPinnedDismissals(vid)
            console.log(
              `[chat-service] chat aberto ${vid} live=${isLive} replay=${isReplay}`
            )
            this.onStatus?.('live', undefined, vid)
            this.emitSessions()
          },
          onEnd: () => this.markSessionEnded(vid),
          onError: (err) => {
            console.warn('[instant-chat]', vid, err.message)
          },
          onModerationEvents: (events, source) => {
            const prev = this.handlingVideoId
            this.handlingVideoId = vid
            try {
              for (const event of events) {
                this.handleIncomingModerationEvent(event, vid, source)
              }
            } finally {
              this.handlingVideoId = prev
            }
          },
          onModerationActivityConfirmed: () => this.markSessionCanModerate(vid),
          onChannelActivityParam: (authorChannelId, params) => this.channelActivity.remember(vid, authorChannelId, params),
          onAutomodHeld: (items) => {
            const prev = this.handlingVideoId
            this.handlingVideoId = vid
            try {
              this.handleAutomodHeldBatch(items, vid)
            } finally {
              this.handlingVideoId = prev
            }
          },
          onActions: (actions, source) => {
            const prev = this.handlingVideoId
            this.handlingVideoId = vid
            try {
              for (const action of actions) {
                this.handleAction(action, source)
              }
            } finally {
              this.handlingVideoId = prev
            }
          },
          onRawLiveChatResponse: (data) => {
            const prev = this.handlingVideoId
            this.handlingVideoId = vid
            try {
              this.ingestLivePollFromResponse(vid, data)
            } finally {
              this.handlingVideoId = prev
            }
          },
          onEmojis: (emojis) => {
            this.applyYoutubeDefaultEmojis(vid, emojis)
          }
        },
        { isReplay }
      )
      this.poller.start()
      session.status = 'live'
      if (activate || this.activeVideoId === videoId) {
        if (!quietStatus || this.activeVideoId === videoId) {
          this.onStatus?.('live', undefined, videoId)
        }
      }
      this.emitSessions()
      this.handlingVideoId = null
      this.persistChannels()
      this.liveWatch.start()

      return sessionInfo
    } catch (e) {
      const err = e as AppError & Error
      const appErr: AppError = {
        code: err.code || 'UNKNOWN',
        message: err.message || 'Could not open chat',
        messageKey: err.messageKey || 'errors.chatOpenFailed',
        params: err.params
      }
      this.handlingVideoId = null
      if (!opts?.quietStatus) {
        this.onStatus?.('error', appErr, this.activeVideoId || undefined)
      }
      this.emitSessions()
      this.liveWatch.start()
      throw appErr
    }
  }

  /**
   * AutoMod held-for-review vindo do JSON cru (instant-chat).
   * Dedup por id â€” o path do Parser tambÃ©m pode emitir a mesma msg.
   */
  private handleAutomodHeldBatch(
    items: AutomodHeldParseResult[],
    videoId: string
  ): void {
    this.automodState.handleHeldBatch(items, videoId)
  }

  /**
   * Guarda snapshot leve no id real e no id do card AutoMod â€” timeout/â‹® nos dois.
   * SÃ³ retÃ©m menuParams + meta; o raw do YT Ã© descartado.
   */
  private storeModeratableItem(
    realId: string,
    localAliasId: string | undefined,
    rawItem: unknown,
    msg?: Pick<
      ChatMessage,
      'authorChannelId' | 'authorName' | 'text' | 'heldForReview'
    >
  ): boolean {
    if (!rawItem || typeof rawItem !== 'object') return false
    const light = this.lightFromRaw(rawItem, msg)
    this.storeChatItem(realId, light, localAliasId)
    if (!light.menuParams) {
      // Guarda mesmo sem menu (eco do poll pode completar); retorna false
      return false
    }
    const videoId = this.handlingVideoId || this.activeVideoId || ''
    if (videoId) this.queueModPrefetch(realId, videoId)
    return true
  }

  private rememberHeldDismissed(messageId: string): void {
    this.automodState.dismiss(messageId)
  }

  private isHeldDismissed(messageId: string | undefined): boolean {
    return this.automodState.isDismissed(messageId)
  }

  /** Apos Exibir: YT manda a msg normal no poll e une bolha + menu real. */
  private absorbAutomodReleaseEcho(
    msg: ChatMessage,
    videoId: string,
    rawItem?: unknown
  ): boolean {
    return this.automodState.absorbReleaseEcho(msg, videoId, rawItem)
  }

  /** Completa params do menu quando o moderate publicou sem contextMenu. */
  private upgradeReleasedMenuIfNeeded(
    msg: ChatMessage,
    videoId: string,
    rawItem?: unknown
  ): boolean {
    if (!rawItem || !msg.id) return false
    const params = extractMenuParamsFromItem(rawItem)
    if (!params) return false
    const existing = this.itemStore.get(msg.id)
    if (existing?.menuParams) return false

    const ok = this.storeModeratableItem(msg.id, undefined, rawItem, msg)
    if (!ok) return false
    this.emitChatMessage(
      {
        ...msg,
        hasContextMenu: true,
        heldForReview: false
      },
      videoId
    )
    console.log(`[automod] menu upgrade id=${msg.id.slice(0, 12)}â€¦`)
    return true
  }

  /**
   * Exibir â†’ bolha normal + tenta menu na resposta moderate / espera eco.
   * Ocultar â†’ remove card.
   */
  private finishAutomodAction(
    messageId: string,
    iconType: string,
    videoId: string,
    moderateData?: unknown
  ): void {
    this.automodState.finishAction(
      messageId,
      iconType,
      videoId,
      moderateData
    )
  }

  private ingestLivePollFromResponse(videoId: string, data: unknown): void {
    this.liveStateService.ingestResponse(videoId, data)
  }

  getLivePoll(videoId?: string | null): LivePollState | null {
    return this.liveStateService.getLivePoll(videoId)
  }

  dismissLivePoll(pollId?: string | null, videoId?: string | null): void {
    this.liveStateService.dismissLivePoll(pollId, videoId)
  }

  getPinnedMessage(videoId?: string | null): LivePinnedMessage | null {
    return this.liveStateService.getPinnedMessage(videoId)
  }

  dismissPinnedMessage(pinId?: string | null, videoId?: string | null): void {
    this.liveStateService.dismissPinnedMessage(pinId, videoId)
  }

  private clearPinnedDismissals(videoId: string): void {
    this.liveStateService.clearPinnedDismissals(videoId)
  }

  async voteLivePoll(
    pollId: string,
    optionId: string,
    videoId?: string | null
  ): Promise<LivePollState | null> {
    return this.liveStateService.voteLivePoll(pollId, optionId, videoId)
  }

  private handleAction(
    action: unknown,
    source: ModerationEventSource = 'live'
  ): void {
    if (!action || typeof action !== 'object') return

    const node = action as {
      type?: string
      item?: { type?: string; id?: string; menu_endpoint?: unknown }
      target_item_id?: string
      external_channel_id?: string
    }

    // Enquete / mensagem fixada (banners do live chat)
    const vid = this.handlingVideoId || this.activeVideoId || ''
    if (vid && this.liveStateService.handleAction(action, vid)) return

    // Mensagem apagada (mod)
    if (
      node.type === 'MarkChatItemAsDeletedAction' ||
      node.type === 'RemoveChatItemAction'
    ) {
      const id = node.target_item_id || (node as { targetItemId?: string }).targetItemId
      if (id) {
        const vid = this.handlingVideoId || this.activeVideoId || ''
        const confirmedExternal = this.confirmedExternalDeletes.delete(`${vid}:${id}`)
        if (confirmedExternal) {
          this.itemStore.delete(id)
          return
        }
        if (source === 'live') {
          logExternalDelete(
            this.sessions.get(vid),
            id,
            this.messageStore,
            this.itemStore.get(id)
          )
        }
        this.itemStore.delete(id)
        this.onRemoved?.({ messageId: id, videoId: vid || undefined })
        if (source === 'bootstrap') return
        this.onMessage?.(
          {
            id,
            authorName: '',
            text: '',
            timestamp: Date.now(),
            removed: true
          },
          vid
        )
      }
      return
    }

    // Replace (Exibir AutoMod: card retido â†’ texto publicado no mesmo id)
    if (
      node.type === 'ReplaceChatItemAction' ||
      /ReplaceChatItem/i.test(String(node.type || ''))
    ) {
      const replacement =
        (node as { replacement?: unknown; replacement_item?: unknown; item?: unknown })
          .replacement ||
        (node as { replacement_item?: unknown }).replacement_item ||
        node.item
      if (replacement) {
        // reprocessa como AddChatItem
        this.handleAction({
          type: 'AddChatItemAction',
          item: replacement
        })
      }
      return
    }

    // Todas as msgs de um autor apagadas (ocultar usuÃ¡rio)
    if (
      node.type === 'MarkChatItemsByAuthorAsDeletedAction' ||
      node.type === 'RemoveChatItemByAuthorAction'
    ) {
      const ch =
        node.external_channel_id ||
        (node as { externalChannelId?: string }).externalChannelId
      if (ch) {
        const vid = this.handlingVideoId || this.activeVideoId || undefined
        this.onRemoved?.({ authorChannelId: ch, videoId: vid })
        // NÃƒO apaga itemStore se estamos rastreando hide â€” precisamos do menu p/ unhide
        const tracked = this.moderationService.hasHiddenUser(ch)
        if (!tracked) {
          for (const [id, stored] of this.itemStore) {
            if (stored.authorChannelId === ch) this.itemStore.delete(id)
          }
        } else {
          console.log(
            `[mod] mantendo itemStore de ${ch.slice(0, 10)}â€¦ p/ desocultar`
          )
        }
      }
      return
    }

    if (node.type === 'AddChatItemAction' || node.item) {
      const item = node.item as
        | YTNodes.LiveChatTextMessage
        | YTNodes.LiveChatPaidMessage
        | YTNodes.LiveChatMembershipItem
        | YTNodes.LiveChatPaidSticker
        | {
            type?: string
            id?: string
            text?: unknown
            subtext?: unknown
            header_primary_text?: unknown
            header_subtext?: unknown
            message?: unknown
          }
        | undefined
      if (!item) return

      let msg: ChatMessage | null = null
      let systemNotice: ChatMessage['systemNotice']
      let systemNoticeText: string | undefined
      const t = item.type

      // Slow mode / modo lento (aviso de sistema do YT)
      if (
        t === 'LiveChatModeChangeMessage' ||
        /ModeChange|mode_change/i.test(String(t || ''))
      ) {
        const primary =
          textOf((item as { text?: unknown }).text) ||
          textOf((item as { header_primary_text?: unknown }).header_primary_text) ||
          textOf((item as { message?: unknown }).message) ||
          ''
        const sub =
          textOf((item as { subtext?: unknown }).subtext) ||
          textOf((item as { header_subtext?: unknown }).header_subtext) ||
          ''
        const slow = parseSlowModeFromModeChange(primary, sub)
        const isSlowMode = slow.enabled !== null
        systemNotice = isSlowMode
          ? {
              kind: 'slow-mode',
              enabled: slow.enabled ?? undefined,
              intervalSeconds: slow.intervalSeconds
            }
          : { kind: 'mode-change' }
        systemNoticeText = isSlowMode
          ? ''
          : [primary, sub].filter(Boolean).join(' \u2014 ')
        const vid = this.handlingVideoId || this.activeVideoId
        if (vid && slow.enabled !== null) {
          const s = this.sessions.get(vid)
          if (s) {
            if (slow.enabled === false) {
              s.slowModeSeconds = 0
              // nÃ£o zera cooldown em andamento (pode ser rate limit)
            } else if (slow.intervalSeconds && slow.intervalSeconds > 0) {
              s.slowModeSeconds = slow.intervalSeconds
            }
            this.emitSessions()
            console.log(
              `[send] slow-mode ${slow.enabled ? 'on' : 'off'} interval=${s.slowModeSeconds || '?'}s`
            )
          }
        }
        // O bootstrap restaura apenas o estado do slow mode; não recria avisos antigos.
        if (source === 'bootstrap') return

        // Ainda pode mostrar a linha de sistema no chat
        if (primary || sub) {
          msg = {
            id: `mode-${Date.now()}`,
            authorName: '',
            text: [primary, sub].filter(Boolean).join(' â€” '),
            timestamp: Date.now()
          }
        } else {
          return
        }
      } else if (t === 'LiveChatTextMessage') {
        msg = fromTextMessage(item as YTNodes.LiveChatTextMessage)
      } else if (t === 'LiveChatPaidMessage') {
        msg = fromPaidMessage(item as YTNodes.LiveChatPaidMessage)
      } else if (t === 'LiveChatMembershipItem') {
        msg = fromMembership(item as YTNodes.LiveChatMembershipItem)
      } else if (t === 'LiveChatPaidSticker') {
        const sticker = item as YTNodes.LiveChatPaidSticker
        const amount = textOf(sticker.purchase_amount) || String(sticker.purchase_amount || '')
        const label = amount
          ? `Super Sticker ${amount}`
          : sticker.sticker_accessibility_label || 'Super Sticker'
        const stickerUrl = pickEmojiUrl(
          sticker.sticker as Array<{ url?: string; width?: number; height?: number }>
        )
        const parts: ChatPart[] = [{ type: 'text', text: `[${label}] ` }]
        if (stickerUrl) {
          parts.push({
            type: 'emoji',
            text: sticker.sticker_accessibility_label || 'sticker',
            url: stickerUrl,
            isCustom: true
          })
        }
        msg = {
          id: sticker.id || `sticker-${Date.now()}`,
          authorName: sticker.author?.name || 'AlguÃ©m',
          authorChannelId: sticker.author?.id,
          text: `[${label}]`,
          parts,
          timestamp: sticker.timestamp_usec
            ? Math.floor(Number(sticker.timestamp_usec) / 1000)
            : sticker.timestamp || Date.now()
        }
      } else if (isAutomodHeldItem(item)) {
        // AutoMod: mensagem retida â€” Mostrar / Ocultar (mÃ³dulo automod-held)
        const held = parseAutomodHeldItem(item)
        if (!held) return
        msg = held.message
        if (this.isHeldDismissed(msg.id)) {
          console.log(
            `[automod] skip held dismissed (action) ${msg.id.slice(0, 12)}â€¦`
          )
          return
        }
        {
          const hVid = this.handlingVideoId || this.activeVideoId || ''
          this.automodState.hold(msg, hVid)
        }
        this.pruneHeldMessagesIfNeeded()
        if (held.endpoints.length > 0) {
          this.cacheEndpoints(msg.id, held.endpoints)
        }
        this.storeChatItem(msg.id, this.lightFromRaw(item, msg))
      }

      if (msg) {
        if (systemNotice) {
          msg.id = (item as { id?: string }).id || msg.id
          msg.text = systemNoticeText ?? ''
          msg.systemNotice = systemNotice
        }

        // Msg ocultada no AutoMod â€” nÃ£o reaparecer como chat normal
        if (this.isHeldDismissed(msg.id)) {
          console.log(
            `[automod] skip emit dismissed ${msg.id.slice(0, 12)}â€¦`
          )
          return
        }

        const isHeld = !!msg.heldForReview
        const light = this.lightFromRaw(item, msg)
        const hasMenu = !isHeld && !!light.menuParams
        msg.hasContextMenu = hasMenu
        if (hasMenu) {
          // Snapshot leve p/ â‹® sob demanda â€” NÃƒO prefetch em cada msg (RAM em flood)
          this.storeChatItem(msg.id, light)
        }

        const vid = this.handlingVideoId || this.activeVideoId || ''
        const memberCache = vid
          ? this.sessions.get(vid)?.memberBadgesByAuthor
          : undefined
        if (memberCache) {
          msg = applyMemberBadgeCache(memberCache, msg)
        }
        if (this.isSelfAuthor(msg)) {
          msg.isSelf = true
          this.rememberSelfBadges(msg, vid)
          msg = this.applySelfBadges(msg, vid)
        }

        // Passa o item cru para o store de moderaÃ§Ã£o no id real
        if (!isHeld && this.absorbIfPendingEcho(msg, item)) {
          return
        }

        // Eco do YT apÃ³s â€œExibirâ€ retida â€” traz id real + menu â‹® / timeout
        if (!isHeld && this.absorbAutomodReleaseEcho(msg, vid, item)) {
          return
        }

        this.emitChatMessage(msg, vid)
      }
    }
  }

  /** Enfileira prÃ©-carga do menu (nÃ£o bloqueia o chat) */
  queueModPrefetch(messageId: string, videoId: string): void {
    this.moderationService.queuePrefetch(messageId, videoId)
  }

  /**
   * ApÃ³s Exibir sem menu: 1 get_live_chat e procura a msg com contextMenu.
   * O moderate publica o id mas quase nunca manda os params do â‹®.
   */
  private async recoverMenuAfterAutomodShow(
    messageId: string,
    text: string,
    videoId: string
  ): Promise<void> {
    if (!this.yt) return
    const cont = this.poller?.getContinuation?.()
    if (!cont) {
      console.warn('[automod] recover menu: sem continuation')
      return
    }
    try {
      // pequena espera p/ o YT indexar a msg publicada
      await new Promise((r) => setTimeout(r, 400))
      const res = (await this.yt.actions.execute('live_chat/get_live_chat', {
        continuation: cont,
        parse: false,
        webClientInfo: { isDocumentHidden: false }
      })) as { data?: unknown }

      // NUNCA fallback sÃ³ por texto â€” pegava outra retida/ocultada no mesmo poll
      const hit =
        findChatItemWithMenuInResponse(res.data, { messageId, text }) ||
        findChatItemWithMenuInResponse(res.data, { messageId })

      if (!hit) {
        console.warn(
          `[automod] recover menu: nÃ£o achei params id=${messageId.slice(0, 12)}â€¦`
        )
        return
      }
      const hitId = hit.id || messageId
      // Se o finder devolveu outro id (bug/ambiguo), sÃ³ aceita se estiver na fila Exibir
      if (
        hitId !== messageId &&
        !this.automodState.hasRelease(hitId) &&
        this.isHeldDismissed(hitId)
      ) {
        console.warn(
          `[automod] recover menu: hit dismissed/errado hit=${hitId.slice(0, 12)}â€¦ want=${messageId.slice(0, 12)}â€¦`
        )
        return
      }
      if (this.isHeldDismissed(hitId) || this.isHeldDismissed(messageId)) {
        console.log(
          `[automod] recover menu: skip dismissed id=${messageId.slice(0, 12)}â€¦`
        )
        return
      }
      const recoveredMsg: Pick<
        ChatMessage,
        'authorChannelId' | 'authorName' | 'text' | 'heldForReview'
      > = {
        authorName: hit.authorName,
        authorChannelId: hit.authorChannelId,
        text: hit.text || text,
        heldForReview: false
      }
      const ok = this.storeModeratableItem(
        hitId,
        messageId,
        hit.rawItem,
        recoveredMsg
      )
      if (ok) {
        this.emitChatMessage(
          {
            id: hitId,
            authorName: hit.authorName,
            authorChannelId: hit.authorChannelId,
            text: hit.text || text,
            parts: [{ type: 'text', text: hit.text || text }],
            timestamp: hit.timestamp,
            hasContextMenu: true,
            heldForReview: false,
            // sÃ³ substitui o card que liberamos
            replacesId: hitId !== messageId ? messageId : undefined
          },
          videoId
        )
        console.log(
          `[automod] recover menu ok id=${hitId.slice(0, 12)}â€¦`
        )
      }
    } catch (e) {
      console.warn('[automod] recover menu failed', (e as Error).message)
    }
  }

  /**
   * Busca menu via get_item_context_menu â€” SEMPRE parse:false.
   * Nunca usa NavigationEndpoint.call / ItemMenu (quebra no timeout).
   */
  private async fetchContextMenuRaw(messageId: string, videoId: string): Promise<unknown> {
    const session = this.requireSession(videoId)
    let stored = session.itemStore.get(messageId)
    if (!stored) {
      throw this.err(
        'CHAT_UNAVAILABLE',
        'Mensagem sem menu de contexto (jÃ¡ saiu do buffer ou Ã© otimista local).'
      )
    }
    if (!this.yt) throw this.err('NOT_LOGGED_IN', 'SessÃ£o invÃ¡lida.')

    let params = stored.menuParams
    let apiUrl = stored.menuApiUrl || 'live_chat/get_item_context_menu'

    // Liberada do AutoMod sem params: tenta recovery no live chat
    if (!params) {
      const hint =
        stored.text ||
        this.automodState.heldText(messageId) ||
        this.messageStore.findAuthor(messageId)?.text ||
        ''
      await this.recoverMenuAfterAutomodShow(messageId, hint, videoId)
      stored = session.itemStore.get(messageId)
      if (stored) {
        params = stored.menuParams
        apiUrl = stored.menuApiUrl || apiUrl
      }
    }

    if (!params) {
      throw this.err(
        'CHAT_UNAVAILABLE',
        'Sem params do menu de contexto nesta mensagem. Aguarde 1â€“2s apÃ³s Exibir e tente de novo.'
      )
    }

    const res = (await this.yt.actions.execute(apiUrl, {
      params,
      parse: false
    })) as { data?: unknown }

    return res.data ?? res
  }

  private cacheEndpoints(
    messageId: string,
    endpoints: RawModEndpoint[],
    videoId?: string
  ): void {
    const vid = videoId || this.handlingVideoId || this.activeVideoId
    if (!vid) return
    this.moderationService.cacheEndpoints(messageId, endpoints, vid)
  }

  /**
   * Monta menu limpo:
   * - Apagar / Ocultar (1 cada)
   * - Suspender (1 botÃ£o) + timeoutDurations separado (vÃ¡rias duraÃ§Ãµes)
   */
  private async fetchModMenu(messageId: string, videoId: string): Promise<ModMenuResult> {
    const session = this.requireSession(videoId)
    const raw = await this.fetchContextMenuRaw(messageId, videoId)
    let endpoints = extractRawModEndpoints(raw)
    // Se o autor estÃ¡ oculto, reclassifica unhide (label PT / params â‰  hide)
    const meta = this.messageStore.findAuthor(messageId)
    const stored = session.itemStore.get(messageId)
    const targetIsSelf = this.isSelfAuthor({
      authorChannelId: stored?.authorChannelId || meta?.channelId,
      authorName: stored?.authorName || meta?.name || ''
    })
    const chKey = stored?.authorChannelId || meta?.channelId
    if (chKey && this.moderationService.hasHiddenUser(chKey)) {
      const merged = [...endpoints, ...extractModerateFromTree(raw)]
      const unhide = this.resolveUnhideFromEndpoints(merged, chKey, messageId)
      if (unhide) {
        // Remove hide-like com os mesmos params do unhide; mantÃ©m o hide original se params batem
        const hideParams = this.moderationService.hiddenUser(chKey)?.hideParams
        endpoints = endpoints.filter(
          (e) =>
            e.kind !== 'unhide' &&
            String(e.body.params || '') !== String(unhide.body.params || '')
        )
        // Garante unhide na lista
        if (!endpoints.some((e) => e.kind === 'unhide')) {
          endpoints.push(unhide)
        }
        // Se sobrou hide com params = unhide, tira
        endpoints = endpoints.filter(
          (e) =>
            !(
              e.kind === 'hide' &&
              String(e.body.params || '') === String(unhide.body.params || '')
            )
        )
        void hideParams
      }
    }

    // Se timeout veio sem moderate, tenta achar duraÃ§Ãµes no mesmo JSON
    if (
      endpoints.some((e) => e.kind === 'timeout' && !e.apiUrl.includes('moderate'))
    ) {
      const durations = extractTimeoutDurations(raw)
      if (durations.length > 0) {
        endpoints = [...endpoints.filter((e) => e.kind !== 'timeout'), ...durations]
      }
    }

    // DuraÃ§Ãµes = SÃ“ tempo (10s, 1mâ€¦) â€” nunca "Live chat" / "Top chat"
    const compiled = compileModerationMenu({
      messageId,
      endpoints,
      timeoutCandidates: extractTimeoutDurations(raw),
      targetIsSelf
    })
    this.cacheEndpoints(messageId, compiled.endpointsToCache, videoId)

    if (compiled.unhideEndpoint) {
      this.rememberUnhideEndpoint(
        messageId,
        compiled.unhideEndpoint,
        undefined,
        videoId
      )
      console.log(
        `[mod] unhide no menu: ${compiled.unhideEndpoint.label} icon=${compiled.unhideEndpoint.iconType}`
      )
    }
    if (compiled.menu.canModerate) this.markSessionCanModerate(videoId)
    return this.channelActivity.decorateMenu(compiled.menu, session, chKey)
  }

  /**
   * Menu de contexto (cache-first).
   * Prefetch em background faz o â‹® abrir sem "Carregandoâ€¦".
   */
  async getModMenu(messageId: string, videoId: string): Promise<ModMenuResult> {
    const session = this.requireSession(videoId)
    const cached = session.modMenuCache.get(messageId)
    if (cached) {
      const stored = session.itemStore.get(messageId)
      const meta = this.messageStore.findAuthor(messageId)
      const authorChannelId = stored?.authorChannelId || meta?.channelId
      return this.channelActivity.decorateMenu(cached, session, authorChannelId)
    }

    try {
      const result = await this.fetchModMenu(messageId, videoId)
      session.modMenuCache.set(messageId, result)
      this.onModMenuReady?.({
        ...result,
        videoId
      })
      console.log(
        `[mod] menu messageId=${messageId.slice(0, 12)}â€¦ actions=${result.actions.length} canModerate=${result.canModerate}`,
        result.actions.map((a) => `${a.kind}:${a.label}`).join(' | ')
      )
      return result
    } catch (e) {
      const err = e as Error & AppError
      if (err.code) throw err
      console.warn('[mod] getModMenu failed', e)
      throw this.err(
        'UNKNOWN',
        err.message || 'Falha ao carregar menu de moderaÃ§Ã£o (vocÃª Ã© mod desta live?)'
      )
    }
  }

  /**
   * Executa moderaÃ§Ã£o. Timeout sem duraÃ§Ã£o: devolve needDurationPicker para a UI.
   */
  async runModAction(
    messageId: string,
    iconType: string,
    videoId: string
  ): Promise<{ needDurationPicker?: ModMenuResult } | void> {
    const session = this.requireSession(videoId)
    try {
      const execution = await this.moderationService.runAction(
        messageId,
        iconType,
        videoId
      )
      if (execution.needDurationPicker) {
        return { needDurationPicker: execution.needDurationPicker }
      }
      const ep = execution.endpoint
      if (!ep) throw this.err('UNKNOWN', 'Acao de moderacao sem endpoint.')
      console.log('[mod] ok ' + ep.kind + ' on ' + messageId.slice(0, 12))

      const vid = videoId

      // AutoMod: Exibir â†’ vira bolha + captura menu; Ocultar â†’ some
      if (isAutomodIconType(iconType)) {
        this.finishAutomodAction(
          messageId,
          iconType,
          vid,
          execution.moderateData
        )
        return
      }

      const modName = this.selfDisplayName()
      const targetMeta = this.messageStore.findAuthor(messageId)
      const storedItem = session.itemStore.get(messageId)
      const targetCh =
        storedItem?.authorChannelId || targetMeta?.channelId || ''
      const targetName =
        storedItem?.authorName || targetMeta?.name || 'Usuario'
      const applied = applyLocalModResult({
        session,
        messageId,
        videoId: vid,
        endpoint: ep,
        modName,
        targetChannelId: targetCh,
        targetName,
        storedText: storedItem?.text,
        messageStore: this.messageStore,
        echo: this.moderationEchoSuppressor,
        onRemoved: (payload) => this.onRemoved?.(payload),
        emitModSystemMessage: (id, opts) => this.emitModSystemMessage(id, opts),
        trackHiddenUser: (key, name, mid, v, hideParams) =>
          this.trackHiddenUser(key, name, mid, v, hideParams)
      })
      this.automodState.dismissAfterModeration(messageId, vid, ep.kind, !!storedItem?.isAutomodHeld)
      if (ep.kind === 'hide' && applied.hideKey) {
        const key = applied.hideKey
        void this.tryCaptureUnhideForAuthor(messageId, key, videoId)
      }
      if (ep.kind === 'unhide') {
        const ch =
          targetCh ||
          this.findHiddenChannelByMessage(messageId) ||
          ''
        // Nome do alvo (lista de ocultados ou meta da msg)
        const banEntry = ch ? this.moderationService.hiddenUser(ch) : undefined
        const unhideTargetName = banEntry?.name || targetName
        if (ch) {
          this.clearHiddenUser(ch)
          this.onRemoved?.({
            authorChannelId: ch.startsWith('msg:') ? undefined : ch,
            messageId: ch.startsWith('msg:') ? messageId : undefined,
            videoId: vid || undefined,
            restored: true
          })
        } else {
          this.onRemoved?.({
            messageId,
            videoId: vid || undefined,
            restored: true
          })
        }
        this.emitModSystemMessage(vid, {
          systemKind: 'mod-unhide',
          systemTargetChannelId: ch || undefined,
          systemTargetName: unhideTargetName,
          systemModeratorName: modName
        })
      }
    } catch (e) {
      const err = e as Error & AppError
      if (err.code) throw err
      console.warn('[mod] runModAction failed', e)
      throw this.err('UNKNOWN', err.message || 'Falha ao executar aÃ§Ã£o de moderaÃ§Ã£o')
    }
  }

  /**
   * ApÃ³s ocultar, o YouTube costuma trocar o item do menu para "Mostrar/Desocultar".
   * Re-busca o menu e cacheia o endpoint de unhide por canal.
   */
  private async tryCaptureUnhideForAuthor(
    messageId: string,
    channelId: string,
    videoId: string
  ): Promise<void> {
    const session = this.sessions.get(videoId)
    if (!session) return
    // YT demora a trocar Hide â†’ "Voltar a exibir" â€” tenta em 0.5s, 1.5s e 3s
    const delays = [500, 1500, 3000]
    for (const ms of delays) {
      try {
        await new Promise((r) => setTimeout(r, ms))
        session.modMenuCache.delete(messageId)
        if (!session.itemStore.has(messageId)) {
          console.warn('[mod] itemStore perdeu a msg â€” nÃ£o dÃ¡ p/ reabrir menu')
          return
        }
        const raw = await this.fetchContextMenuRaw(messageId, videoId)
        const endpoints = [
          ...extractRawModEndpoints(raw),
          ...extractModerateFromTree(raw)
        ]
        const labels = endpoints.map((e) => `${e.kind}:${e.label}`).join(' | ')
        console.log(`[mod] menu pÃ³s-hide (+${ms}ms): ${labels || '(vazio)'}`)

        const unhide = this.resolveUnhideFromEndpoints(
          endpoints,
          channelId,
          messageId
        )
        if (unhide) {
          this.cacheEndpoints(messageId, [unhide], videoId)
          this.rememberUnhideEndpoint(messageId, unhide, channelId, videoId)
          console.log(
            `[mod] unhide capturado (+${ms}ms) p/ ${channelId.slice(0, 12)}â€¦ "${unhide.label}"`
          )
          return
        }
      } catch (e) {
        console.warn(`[mod] tryCaptureUnhide +${ms}ms failed`, e)
      }
    }
    console.warn(
      '[mod] unhide nÃ£o capturado apÃ³s hide. Abra o â‹® na msg (Voltar a exibir) ou use Desocultar no painel.'
    )
  }

  /** Resolve duraÃ§Ãµes do timeout sÃ³ com parse:false */
  private async resolveTimeoutDurations(
    messageId: string,
    timeoutEp: RawModEndpoint,
    videoId: string
  ): Promise<RawModEndpoint[]> {
    if (!this.yt) return []

    if (timeoutEp.apiUrl.includes('moderate') && timeoutEp.body.params) {
      return [timeoutEp]
    }

    try {
      // Reusa o JSON do menu (jÃ¡ tem o dialog embutido em muitos casos)
      const menuRaw = await this.fetchContextMenuRaw(messageId, videoId)
      let durations = extractTimeoutDurations(menuRaw)
      if (durations.length > 0) {
        console.log(
          `[mod] timeout durations (menu) â†’ ${durations.map((d) => d.label).join(', ')}`
        )
        return durations
      }

      // Segundo request sÃ³ se o endpoint do timeout tiver api/params reais
      if (timeoutEp.apiUrl && timeoutEp.apiUrl !== 'live_chat/get_item_context_menu') {
        const res = (await this.yt.actions.execute(timeoutEp.apiUrl, {
          ...timeoutEp.body,
          parse: false
        })) as { data?: unknown }
        durations = extractTimeoutDurations(res.data ?? res)
        console.log(
          `[mod] timeout durations (endpoint) â†’ ${durations.map((d) => d.label).join(', ')}`
        )
        return durations
      }

      return []
    } catch (e) {
      console.warn('[mod] resolveTimeoutDurations failed', e)
      return []
    }
  }

  async sendMessage(text: string): Promise<void> {
    await this.messageSender.send(text)
  }

  /**
   * Para pollers sem apagar abas (troca de Brand / refresh cookie).
   * As abas ficam connecting ate rejoinSessionsAfterAuth.
   */
  stopAllPollers(): void {
    for (const s of this.sessions.values()) {
      try {
        s.poller?.stop()
      } catch {
        /* ignore */
      }
      try {
        s.liveChat?.stop()
      } catch {
        /* ignore */
      }
      s.poller = null
      s.liveChat = null
      if (s.status === 'live') s.status = 'connecting'
    }
    this.handlingVideoId = null
    this.emitSessions()
  }

  /**
   * ApÃ³s trocar Brand / re-login: grava abas abertas e restaura do channels.json.
   * Garante que a lista de canais volta na UI (antes o stopChat apagava tudo).
   */
  async rejoinSessionsAfterAuth(): Promise<void> {
    if (!this.cookie) return
    if (this.sessions.size > 0 && !this.restoringChannels) {
      try {
        this.persistChannels()
      } catch {
        /* ignore */
      }
    }
    // Limpa memÃ³ria sem segundo persist (jÃ¡ salvou acima)
    for (const id of [...this.sessions.keys()]) {
      this.destroySession(id)
    }
    this.activeVideoId = null
    this.handlingVideoId = null
    await this.restoreSavedChannels()
  }

  /**
   * Fecha pollers e remove abas da memÃ³ria.
   * Grava canais no disco ANTES de limpar â€” senÃ£o logout/login perde a lista.
   */
  stopChat(): void {
    this.liveWatch.stop()
    this.confirmedExternalDeletes.clear()
    // Snapshot das abas abertas â†’ channels.json (sobrevive logout)
    if (!this.restoringChannels && this.sessions.size > 0) {
      try {
        this.persistChannels()
      } catch {
        /* ignore */
      }
    }
    for (const id of [...this.sessions.keys()]) {
      this.destroySession(id)
    }
    this.activeVideoId = null
    this.handlingVideoId = null
    this.emitSessions()
    this.onStatus?.('idle')
  }
}

export const chatService = new ChatService()
