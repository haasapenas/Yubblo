export type ChatPart =
  | { type: 'text'; text: string }
  | {
      type: 'emoji'
      text: string
      url: string
      isCustom?: boolean
      emojiId?: string
      zeroWidth?: boolean
      provider?: 'youtube' | '7tv'
    }

export interface ChatSystemNotice {
  kind: 'slow-mode' | 'mode-change'
  enabled?: boolean
  intervalSeconds?: number
}

export interface ChatMessage {
  id: string
  authorName: string
  authorChannelId?: string
  authorAvatarUrl?: string
  text: string
  parts?: ChatPart[]
  timestamp: number
  isOwner?: boolean
  isModerator?: boolean
  isMember?: boolean
  isVerified?: boolean
  isSelf?: boolean
  pending?: boolean
  failed?: boolean
  awaitingEcho?: boolean
  hasContextMenu?: boolean
  removed?: boolean
  replacesId?: string
  heldForReview?: boolean
  heldHeader?: string
  heldActions?: Array<{ iconType: string; label: string; action: 'show' | 'hide' }>
  systemNotice?: ChatSystemNotice
  systemKind?: 'mod-delete' | 'mod-timeout' | 'mod-hide' | 'mod-unhide'
  systemTargetChannelId?: string
  systemTargetName?: string
  systemModeratorName?: string
  systemDurationKey?: string
  systemDeletedText?: string
  systemSourceMessageId?: string
}

export interface OpenChannelOpts {
  sourceInput?: string
  channelHandle?: string
  preferVideoTab?: boolean
  replaceVideoId?: string
  replaceSameChannel?: boolean
  activate?: boolean
  quietStatus?: boolean
  tabKey?: string
  replacePending?: boolean
}

export interface LiveSessionInfo {
  videoId: string
  title: string
  channelName: string
  channelHandle?: string
  input?: string
  isLive?: boolean
  isReplay?: boolean
  tabKey?: string
}

export interface LiveStreamOption {
  videoId: string
  title: string
  channelName?: string
  thumbnailUrl?: string
  viewerText?: string
  isLive?: boolean
}

export interface ListChannelLivesResult {
  input: string
  channelLabel: string
  lives: LiveStreamOption[]
  directVideoId?: string
}

export type ChatStatus = 'idle' | 'connecting' | 'live' | 'error' | 'ended'

export interface ChannelTab {
  videoId: string
  title: string
  channelName: string
  channelHandle?: string
  isLive?: boolean
  isReplay?: boolean
  status: ChatStatus
  tabKey?: string
  canModerate?: boolean
  sendCooldownUntil?: number
  slowModeSeconds?: number
}

export type AppErrorCode =
  | 'NOT_LOGGED_IN'
  | 'CHANNEL_NOT_FOUND'
  | 'NOT_LIVE'
  | 'CHAT_UNAVAILABLE'
  | 'SEND_FAILED'
  | 'NETWORK_ERROR'
  | 'AUTH_FAILED'
  | 'UNKNOWN'

export interface AppError {
  code: AppErrorCode
  message: string
  messageKey?: string
  params?: Record<string, string | number>
}

export interface EmoteCatalogItem {
  id: string
  name: string
  url: string
  provider: '7tv' | 'youtube'
  scope: 'channel' | 'global'
  zeroWidth?: boolean
}

export interface EmoteCatalog {
  videoId: string | null
  channelName?: string
  stvChannel: EmoteCatalogItem[]
  stvGlobal: EmoteCatalogItem[]
  youtube: EmoteCatalogItem[]
}
