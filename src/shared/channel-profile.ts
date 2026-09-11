export type ChatUserProfileTarget = {
  authorName: string
  authorChannelId?: string
  authorAvatarUrl?: string
}

export function youtubeChannelUrl(channelId: string | undefined): string | null {
  const normalized = (channelId || '').trim()
  if (!normalized || !/^[A-Za-z0-9_-]{2,128}$/.test(normalized)) return null
  return `https://www.youtube.com/channel/${normalized}`
}
