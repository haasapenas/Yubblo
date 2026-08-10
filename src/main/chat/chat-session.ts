import type { InstantLiveChatPoller } from '../instant-chat'
import { ChannelActivityParamIndex } from '../channel-activity/channel-activity-params'
import type { ParsedLivePoll } from '../live/live-poll'
import type { RawModEndpoint } from '../moderation/moderation-parser'
import type { StvEmoteMap } from '../emotes/seventv'
import type {
  AppError,
  ChannelTab,
  ChatMessage,
  ChatStatus,
  LivePinnedMessage,
  LivePollState,
  LiveSessionInfo,
  ModMenuResult
} from '../../shared/types'

/** Instancia retornada por VideoInfo.getLiveChat(). */
export type LiveChatHandle = {
  start: () => void
  stop: () => void
  sendMessage: (text: string) => Promise<Iterable<unknown>>
  applyFilter?: (filter: 'TOP_CHAT' | 'LIVE_CHAT') => void
  getItemMenu?: (item: unknown) => Promise<{
    items: () => unknown[]
    selectItem: (iconOrButton: string | unknown) => Promise<unknown>
  }>
  on: (event: string, listener: (...args: never[]) => void) => void
}

export type MessageHandler = (msg: ChatMessage, videoId: string) => void
export type StatusHandler = (
  status: 'idle' | 'connecting' | 'live' | 'error' | 'ended',
  error?: AppError,
  videoId?: string
) => void
export type EmotesReadyHandler = (videoId: string) => void
export type RemovedHandler = (payload: {
  messageId?: string
  authorChannelId?: string
  videoId?: string
  /** Persiste timeout/hide ate este horario para reconstruir o historico. */
  moderatedThrough?: number
  /** true = desocultar (restaurar msgs do autor na UI) */
  restored?: boolean
  /** AutoMod Ocultar - remove card retido da lista. */
  heldDismissed?: boolean
}) => void
export type ModMenuReadyHandler = (result: ModMenuResult & { videoId?: string }) => void
export type SessionsChangedHandler = (payload: {
  tabs: ChannelTab[]
  activeVideoId: string | null
}) => void
export type HiddenUsersHandler = (
  list: Array<{ channelId: string; name: string; canUnhide: boolean }>
) => void
export type LivePollHandler = (poll: LivePollState | null) => void
export type PinnedHandler = (pin: LivePinnedMessage | null) => void

/**
 * Buffer leve para moderacao. Nao guarda o no cru do YouTube.
 */
export type StoredChatItem = {
  menuParams?: string
  menuApiUrl?: string
  authorChannelId?: string
  authorName?: string
  text?: string
  isAutomodHeld?: boolean
}

/** Estado isolado por live/canal. */
export type ChannelSession = {
  info: LiveSessionInfo
  status: ChatStatus
  poller: InstantLiveChatPoller | null
  liveChat: LiveChatHandle | null
  sendVideoId: string | null
  sendChannelId: string | null
  sendParams: string | null
  pendingSends: Array<{ id: string; text: string; at: number }>
  itemStore: Map<string, StoredChatItem>
  modMenuCache: Map<string, ModMenuResult>
  channelActivityParams: ChannelActivityParamIndex
  modEndpointCache: Map<string, Map<string, RawModEndpoint>>
  modPrefetchQueue: string[]
  modPrefetchInFlight: Set<string>
  modPrefetchActive: number
  sendInFlight: number
  seventvMap: StvEmoteMap
  youtubeChannelId?: string
  youtubeDefaultEmojis: Map<
    string,
    { id: string; name: string; url: string; isCustom: boolean }
  >
  sendBenchDone: boolean
  sendCooldownUntil: number
  slowModeSeconds: number
  selfBadges: {
    isModerator: boolean
    isMember: boolean
    isOwner: boolean
    isVerified: boolean
  }
  canModerate: boolean
  livePoll: ParsedLivePoll | null
  livePollFingerprint?: string
  livePollPercentsLog?: string
  dismissedPollKeys: Set<string>
  pinnedMessage: LivePinnedMessage | null
  pinnedFingerprint?: string
  dismissedPinKeys: Set<string>
}

export function createChannelSession(info: LiveSessionInfo): ChannelSession {
  return {
    info,
    status: 'connecting',
    poller: null,
    liveChat: null,
    sendVideoId: null,
    sendChannelId: null,
    sendParams: null,
    pendingSends: [],
    itemStore: new Map(),
    modMenuCache: new Map(),
    channelActivityParams: new ChannelActivityParamIndex(),
    modEndpointCache: new Map(),
    modPrefetchQueue: [],
    modPrefetchInFlight: new Set(),
    modPrefetchActive: 0,
    sendInFlight: 0,
    seventvMap: new Map(),
    youtubeDefaultEmojis: new Map(),
    sendBenchDone: false,
    sendCooldownUntil: 0,
    slowModeSeconds: 0,
    selfBadges: {
      isModerator: false,
      isMember: false,
      isOwner: false,
      isVerified: false
    },
    canModerate: false,
    livePoll: null,
    dismissedPollKeys: new Set(),
    pinnedMessage: null,
    dismissedPinKeys: new Set()
  }
}
export function clearChannelSessionRuntime(session: ChannelSession): void {
  session.poller = null
  session.liveChat = null
  session.sendVideoId = null
  session.sendChannelId = null
  session.sendParams = null
  session.pendingSends.length = 0
  session.itemStore.clear()
  session.modMenuCache.clear()
  session.channelActivityParams.clear()
  session.modEndpointCache.clear()
  session.modPrefetchQueue.length = 0
  session.modPrefetchInFlight.clear()
  session.modPrefetchActive = 0
  session.sendInFlight = 0
  session.seventvMap.clear()
  session.youtubeDefaultEmojis.clear()
  session.dismissedPollKeys.clear()
  session.dismissedPinKeys.clear()
  session.livePoll = null
  session.livePollFingerprint = undefined
  session.livePollPercentsLog = undefined
  session.pinnedMessage = null
  session.pinnedFingerprint = undefined
}