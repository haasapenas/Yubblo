/// <reference types="vite/client" />

import type {
  ChannelActivityPopupApi,
  ChatSearchPopupApi,
  ModerationLogsPopupApi,
  SettingsPopupApi,
  YubbloApi
} from '../../shared/contracts/api'

declare global {
  interface Window {
    yubblo: YubbloApi
    channelActivity: ChannelActivityPopupApi
    chatSearch: ChatSearchPopupApi
    settingsPopup: SettingsPopupApi
    moderationLogs: ModerationLogsPopupApi
  }
}

export {}
