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
  return Boolean(findMonitoredUser(authorChannelId, authorName, users))
}

export function findMonitoredUser(
  authorChannelId: string | undefined,
  authorName: string,
  users: readonly MonitoredUser[]
): MonitoredUser | undefined {
  const normalizedName = normalizeMonitoringName(authorName)
  return users.find((user) => user.channelId
    ? Boolean(authorChannelId && user.channelId === authorChannelId)
    : Boolean(normalizedName && normalizeMonitoringName(user.name) === normalizedName))
}
