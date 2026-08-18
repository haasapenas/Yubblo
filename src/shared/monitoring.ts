import type { MonitoredUser } from './contracts/settings'

export function normalizeMonitoringName(value: string): string {
  return value.trim().replace(/^@/, '').trim().toLowerCase()
}

export function monitoredUserKey(user: MonitoredUser): string {
  return user.channelId
    ? `channel:${user.channelId}`
    : `name:${normalizeMonitoringName(user.name)}`
}

export function isMonitoredAuthor(
  authorChannelId: string | undefined,
  authorName: string,
  users: readonly MonitoredUser[]
): boolean {
  const normalizedName = normalizeMonitoringName(authorName)
  return users.some((user) => user.channelId
    ? Boolean(authorChannelId && user.channelId === authorChannelId)
    : Boolean(normalizedName && normalizeMonitoringName(user.name) === normalizedName))
}
