export const CHANNEL_ACTIVITY_MESSAGES_PER_LIVE_LIMIT = 100
export const CHANNEL_ACTIVITY_MESSAGE_LIMIT = CHANNEL_ACTIVITY_MESSAGES_PER_LIVE_LIMIT
export interface ChannelActivityTarget { videoId: string; messageId: string; authorChannelId: string; authorName: string }
export interface ChannelActivityHandleInput { videoId: string; handle: string; authorChannelId?: string; authorName?: string }
export interface ChannelActivityProfile { channelId: string; name: string; avatarUrl?: string; createdText?: string; subscribersText?: string }
export interface ChannelActivityReputation { deletedMessages: number; timeouts: number; hides: number }
export interface ChannelActivityMessage { id: string; authorName: string; avatarUrl?: string; text: string; timestamp: number }
export interface ChannelActivityGroup { key: string; title: string; messages: ChannelActivityMessage[] }
export interface ChannelActivityPage { requestId: string; profile?: ChannelActivityProfile; reputation?: ChannelActivityReputation; groups: ChannelActivityGroup[]; messageCount: number; hasMore: boolean }

export type ChannelActivityModerationKind = 'timeout' | 'hide'
export interface ChannelActivityModerationAction { id: string; iconType: string; kind: ChannelActivityModerationKind; label: string }
export interface ChannelActivityModerationState { actions: ChannelActivityModerationAction[]; busyActionId?: string; completedKind?: ChannelActivityModerationKind; feedback?: string; error?: string }
export interface ChannelActivityModerationRequest { videoId: string; messageId: string; authorChannelId: string; iconType: string }
export type ChannelActivityWindowState =
  | { status: 'loading'; target: ChannelActivityTarget }
  | { status: 'ready'; target: ChannelActivityTarget; page: ChannelActivityPage; loadingMore?: boolean; moderation?: ChannelActivityModerationState }
  | { status: 'error'; target: ChannelActivityTarget; message: string }
