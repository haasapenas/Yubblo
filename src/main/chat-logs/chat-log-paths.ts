import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join, normalize, resolve, sep } from 'path'

const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
])

const INVALID_PATH_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

export function sanitizePathSegment(raw: string, maxLen = 80): string {
  let value = String(raw || '')
    .normalize('NFKC')
    .replace(/^@+/, '')
    .replace(INVALID_PATH_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')

  if (!value) value = 'untitled'
  if (RESERVED_NAMES.has(value.toUpperCase())) value = `_${value}`
  if (value.length > maxLen) {
    value = value.slice(0, maxLen).replace(/[. ]+$/g, '') || 'untitled'
  }
  return value
}

export function normalizeChannelKey(raw: string): string {
  return String(raw || '').trim().replace(/^@+/, '').toLowerCase()
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatLocalTime(date: Date): string {
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${hour}:${minute}:${second}`
}

export function chatLogsRoot(base = app.getPath('userData')): string {
  const root = join(base, 'chat-logs')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

export interface LiveLogFileInput {
  videoId: string
  title: string
  startedAt: number | Date
}

export function liveLogFileName(input: LiveLogFileInput): string {
  const date = input.startedAt instanceof Date
    ? input.startedAt
    : new Date(input.startedAt)
  const safeVideoId = sanitizePathSegment(input.videoId, 40)
  const safeTitle = sanitizePathSegment(input.title, 64).replace(/\s+/g, '-')
  return `${formatLocalDate(date)}_${safeVideoId}_${safeTitle}.txt`
}

function isInsideRoot(root: string, target: string): boolean {
  const resolvedRoot = normalize(resolve(root))
  const resolvedTarget = normalize(resolve(target))
  const rootPrefix = `${resolvedRoot}${sep}`
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(rootPrefix)
}

function resolveInsideRoot(root: string, segments: string[]): string | null {
  if (
    segments.some((segment) => {
      const value = String(segment)
      return !value || value.includes('..') || /[\\/]/.test(value) || /^[a-zA-Z]:/.test(value)
    })
  ) {
    return null
  }
  const target = resolve(root, ...segments.map(String))
  return isInsideRoot(root, target) ? target : null
}

export function resolveInsideChatLogs(...segments: string[]): string | null {
  return resolveInsideRoot(chatLogsRoot(), segments)
}

export function liveLogPath(
  channelKey: string,
  videoId: string,
  title: string,
  startedAt: number | Date,
  base = app.getPath('userData')
): string | null {
  const root = chatLogsRoot(base)
  const folder = sanitizePathSegment(normalizeChannelKey(channelKey), 64)
  const fileName = liveLogFileName({ videoId, title, startedAt })
  return resolveInsideRoot(root, [folder, fileName])
}
