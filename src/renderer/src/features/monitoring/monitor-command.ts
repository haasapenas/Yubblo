import type { MonitoredUser, MonitoringSettings } from '../../../../shared/types'
import { findMonitoredUser, normalizeMonitoringName } from '../../../../shared/monitoring'
import type { ChatAuthor } from '../chat/composer/Composer'

export type MonitorCommand =
  | { kind: 'monitor' | 'unmonitor'; handle: string }
  | { kind: 'invalid'; command: 'monitor' | 'unmonitor' }

export function parseMonitorCommand(value: string): MonitorCommand | null {
  const trimmed = value.trim()
  const head = /^\/(un)?monitor(?:\s|$)/i.exec(trimmed)
  if (!head) return null
  const command = head[1] ? 'unmonitor' : 'monitor'
  const match = /^\/(?:un)?monitor\s+@?([^\s@]+)$/i.exec(trimmed)
  return match ? { kind: command, handle: match[1] } : { kind: 'invalid', command }
}

function commandError(messageKey: string, message: string, params?: Record<string, string>): Error {
  return new Error(JSON.stringify({ code: 'UNKNOWN', message, messageKey, params }))
}

function resolveUser(handle: string, authors: readonly ChatAuthor[]): MonitoredUser {
  const normalized = normalizeMonitoringName(handle)
  const author = authors.find((item) => normalizeMonitoringName(item.name) === normalized)
  return author?.channelId
    ? { channelId: author.channelId, name: author.name }
    : { name: `@${handle.replace(/^@+/, '')}` }
}

export function applyMonitorCommand(
  command: MonitorCommand,
  authors: readonly ChatAuthor[],
  monitoring: MonitoringSettings
): MonitoringSettings {
  if (command.kind === 'invalid') {
    throw command.command === 'monitor'
      ? commandError('chat:commands.monitorUsage', 'Use /monitor @handle.')
      : commandError('chat:commands.unmonitorUsage', 'Use /unmonitor @handle.')
  }

  const user = resolveUser(command.handle, authors)
  const existing = findMonitoredUser(user.channelId, user.name, monitoring.users)
  const label = `@${command.handle.replace(/^@+/, '')}`

  if (command.kind === 'monitor') {
    if (existing) {
      throw commandError('chat:commands.alreadyMonitored', `${label} is already monitored.`, { user: label })
    }
    return { ...monitoring, users: [...monitoring.users, user] }
  }

  if (!existing) {
    throw commandError('chat:commands.notMonitored', `${label} is not monitored.`, { user: label })
  }
  return { ...monitoring, users: monitoring.users.filter((item) => item !== existing) }
}
