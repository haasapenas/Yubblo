export interface UserProfile {
  name: string
  handle?: string
  avatarUrl?: string
  channelId?: string
}

export interface SavedAccountInfo {
  id: string
  profile: UserProfile
  lastUsed: number
  active: boolean
}

export interface AuthState {
  loggedIn: boolean
  profile: UserProfile | null
  accounts?: SavedAccountInfo[]
  activeAccountId?: string | null
}

export interface YtChannelIdentity {
  id: string
  name: string
  handle?: string
  avatarUrl?: string
  byline?: string
  isSelected: boolean
  hasChannel: boolean
}
