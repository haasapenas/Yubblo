import type { AuthState, SavedAccountInfo, YtChannelIdentity } from './auth'
import type {
  AppError,
  ChannelTab,
  ChatMessage,
  ChatStatus,
  EmoteCatalog,
  ListChannelLivesResult,
  LiveSessionInfo,
  OpenChannelOpts
} from './chat'
import type { LivePinnedMessage, LivePollState } from './live'
import type { ModMenuResult } from './moderation'
import type { AppSettings, ChatActionButton, HighlightPreferences, HighlightRule, MonitoringSettings } from './settings'
import type { AppLocale } from '../i18n/locale'
import type { HighlightSoundData } from './highlight-sounds'
import type { ChannelActivityHandleInput, ChannelActivityModerationRequest, ChannelActivityTarget, ChannelActivityWindowState } from './channel-activity'
import type { ChatSearchWindowState } from './chat-search'
import type {
  ModerationLogAppendEvent,
  ModerationLogChannelGroup,
  ModerationLogErrorEvent,
  ModerationLogExportResult,
  ModerationLogFilters,
  ModerationLogPage,
  ModerationLogPageRequest,
  ModerationLogStreamKey
} from './moderation-logs'
import type { AppUpdateState } from './update'

export interface AppUpdateApi {
  getState: () => Promise<AppUpdateState>
  check: () => Promise<AppUpdateState>
  download: () => Promise<AppUpdateState>
  install: () => Promise<void>
  openWindow: () => Promise<void>
  onChanged: (cb: (state: AppUpdateState) => void) => () => void
}

export interface YubbloApi {
  auth: {
    getState: () => Promise<AuthState>
    login: () => Promise<AuthState>
    addAccount: () => Promise<AuthState>
    switchChannel: () => Promise<AuthState>
    listChannelIdentities: () => Promise<YtChannelIdentity[]>
    switchChannelIdentity: (identityId: string) => Promise<AuthState>
    switchAccount: (accountId: string) => Promise<AuthState>
    removeAccount: (accountId: string) => Promise<AuthState>
    listAccounts: () => Promise<SavedAccountInfo[]>
    logout: () => Promise<AuthState>
    onChanged: (cb: (state: AuthState) => void) => () => void
  }
  chat: {
    openByChannel: (input: string, opts?: OpenChannelOpts) => Promise<LiveSessionInfo>
    listChannelLives: (input: string) => Promise<ListChannelLivesResult>
    switchSession: (videoId: string) => Promise<LiveSessionInfo | null>
    closeSession: (videoId: string) => Promise<LiveSessionInfo | null>
    listSessions: () => Promise<{ tabs: ChannelTab[]; activeVideoId: string | null }>
    send: (text: string) => Promise<void>
    clear: (videoId: string) => Promise<number>
    stop: () => Promise<void>
    getEmoteCatalog: (videoId?: string | null) => Promise<EmoteCatalog>
    getModMenu: (messageId: string, videoId: string) => Promise<ModMenuResult>
    openChannelActivityWindow: (target: ChannelActivityTarget) => Promise<void>
    openChannelActivityByHandle: (input: ChannelActivityHandleInput) => Promise<void>
    /** Abre janela de busca no histórico do chat (Ctrl+F) */
    openSearchWindow: (state: ChatSearchWindowState) => Promise<void>
    prefetchModMenu: (messageId: string, videoId: string) => Promise<void>
    runModAction: (
      messageId: string,
      iconType: string,
      videoId: string
    ) => Promise<{ needDurationPicker?: ModMenuResult } | void>
    onMessage: (cb: (msg: ChatMessage & { videoId?: string }) => void) => () => void
    onStatus: (
      cb: (status: { status: ChatStatus; error?: AppError; videoId?: string }) => void
    ) => () => void
    onEmotesReady: (cb: (payload: { videoId: string }) => void) => () => void
    onRemoved: (
      cb: (payload: {
        messageId?: string
        authorChannelId?: string
        videoId?: string
        moderatedThrough?: number
        restored?: boolean
        heldDismissed?: boolean
      }) => void
    ) => () => void
    listHiddenUsers: () => Promise<
      Array<{ channelId: string; name: string; canUnhide: boolean }>
    >
    unhideUser: (channelId: string) => Promise<void>
    onHiddenUsersChanged: (
      cb: (list: Array<{ channelId: string; name: string; canUnhide: boolean }>) => void
    ) => () => void
    onModMenuReady: (cb: (menu: ModMenuResult & { videoId?: string }) => void) => () => void
    onSessionsChanged: (
      cb: (payload: { tabs: ChannelTab[]; activeVideoId: string | null }) => void
    ) => () => void
    getLivePoll: (videoId?: string | null) => Promise<LivePollState | null>
    voteLivePoll: (
      pollId: string,
      optionId: string,
      videoId?: string | null
    ) => Promise<LivePollState | null>
    dismissLivePoll: (pollId?: string | null, videoId?: string | null) => Promise<void>
    onLivePoll: (cb: (poll: LivePollState | null) => void) => () => void
    getPinnedMessage: (videoId?: string | null) => Promise<LivePinnedMessage | null>
    dismissPinnedMessage: (pinId?: string | null, videoId?: string | null) => Promise<void>
    onPinnedMessage: (cb: (pin: LivePinnedMessage | null) => void) => () => void
  }
  settings: {
    get: () => Promise<AppSettings>
    setLocale: (locale: AppLocale) => Promise<AppSettings>
    setChatFontSize: (fontSize: number) => Promise<AppSettings>
    setPauseChatOnHover: (enabled: boolean) => Promise<AppSettings>
    setShowFocusModeShortcut: (enabled: boolean) => Promise<AppSettings>
    setHighlights: (rules: HighlightRule[]) => Promise<AppSettings>
    setHighlightPreferences: (preferences: HighlightPreferences) => Promise<AppSettings>
    setMonitoring: (monitoring: MonitoringSettings) => Promise<AppSettings>
    chooseHighlightSound: () => Promise<string | null>
    readHighlightSound: (path: string) => Promise<HighlightSoundData>
    setActionButtons: (buttons: ChatActionButton[]) => Promise<AppSettings>
    openWindow: () => Promise<void>
    onChanged: (cb: (settings: AppSettings) => void) => () => void
  }
  update: AppUpdateApi
  moderationLogs: {
    openWindow: () => Promise<void>
  }
  /** Controles da janela (topbar custom no Windows/Linux) */
  window: {
    platform: () => Promise<NodeJS.Platform>
    minimize: () => Promise<void>
    maximize: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }
}

export interface ChannelActivityPopupApi {
  getLocale: () => Promise<AppLocale>
  loadMore: () => Promise<void>
  close: () => Promise<void>
  runModeration: (request: ChannelActivityModerationRequest) => Promise<void>
  onState: (cb: (state: ChannelActivityWindowState) => void) => () => void
}

export interface ChatSearchPopupApi {
  getLocale: () => Promise<AppLocale>
  close: () => Promise<void>
  onState: (cb: (state: ChatSearchWindowState) => void) => () => void
}

/** API da janela de Settings (save imediato via IPC settings:*) */
export interface SettingsPopupApi {
  get: () => Promise<AppSettings>
  setLocale: (locale: AppLocale) => Promise<AppSettings>
  setChatFontSize: (fontSize: number) => Promise<AppSettings>
  setPauseChatOnHover: (enabled: boolean) => Promise<AppSettings>
  setShowFocusModeShortcut: (enabled: boolean) => Promise<AppSettings>
  setHighlights: (rules: HighlightRule[]) => Promise<AppSettings>
  setHighlightPreferences: (preferences: HighlightPreferences) => Promise<AppSettings>
  setMonitoring: (monitoring: MonitoringSettings) => Promise<AppSettings>
  chooseHighlightSound: () => Promise<string | null>
  readHighlightSound: (path: string) => Promise<HighlightSoundData>
  setActionButtons: (buttons: ChatActionButton[]) => Promise<AppSettings>
  close: () => Promise<void>
  openModerationLogs: () => Promise<void>
  update: AppUpdateApi
  onChanged: (cb: (settings: AppSettings) => void) => () => void
}

export interface UpdatePopupApi extends AppUpdateApi {
  getLocale: () => Promise<AppLocale>
  close: () => Promise<void>
}

/** API da janela de registros de moderação */
export interface ModerationLogsPopupApi {
  getLocale: () => Promise<AppLocale>
  listChannels: () => Promise<ModerationLogChannelGroup[]>
  readPage: (request: ModerationLogPageRequest) => Promise<ModerationLogPage>
  exportCsv: (payload: {
    streamKey: ModerationLogStreamKey
    videoId?: string
    filters?: ModerationLogFilters
  }) => Promise<ModerationLogExportResult | null>
  deleteStream: (
    streamKey: ModerationLogStreamKey
  ) => Promise<
    | { ok: true }
    | { ok: false; cancelled?: boolean; error?: string }
  >
  close: () => Promise<void>
  onAppended: (cb: (event: ModerationLogAppendEvent) => void) => () => void
  onError: (cb: (event: ModerationLogErrorEvent) => void) => () => void
}

declare global {
  interface Window {
    yubblo: YubbloApi
    channelActivity: ChannelActivityPopupApi
    chatSearch: ChatSearchPopupApi
    settingsPopup: SettingsPopupApi
    moderationLogs: ModerationLogsPopupApi
    updatePopup: UpdatePopupApi
  }
}
