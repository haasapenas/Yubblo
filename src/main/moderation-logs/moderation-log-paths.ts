/**
 * Sanitização e resolução de caminhos sob moderation-logs/.
 * Nunca resolve path fora da raiz de logs.
 */
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join, normalize, resolve, sep } from 'path'

const RESERVED = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

/** Segmento de pasta seguro (Windows + Unix). */
export function sanitizePathSegment(raw: string, maxLen = 80): string {
  let s = String(raw || '')
    .normalize('NFKC')
    .replace(INVALID_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  if (!s) s = 'untitled'
  if (RESERVED.has(s.toUpperCase())) s = `_${s}`
  if (s.length > maxLen) {
    s = s.slice(0, maxLen).replace(/[. ]+$/g, '') || 'untitled'
  }
  return s
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatLocalTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${min}:${s}`
}

export function streamFolderName(
  date: string,
  videoId: string,
  title: string
): string {
  const safeVideo = sanitizePathSegment(videoId, 40)
  const safeTitle = sanitizePathSegment(title, 48)
  return sanitizePathSegment(`${date}_${safeVideo}_${safeTitle}`, 120)
}

export function makeStreamKey(channelId: string, folderName: string): string {
  const ch = sanitizePathSegment(channelId, 64)
  const folder = sanitizePathSegment(folderName, 120)
  return `${ch}/${folder}`
}

export function splitStreamKey(
  key: string
): { channelId: string; folderName: string } | null {
  const raw = String(key || '').replace(/\\/g, '/').trim()
  if (!raw || raw.includes('..') || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) {
    return null
  }
  const parts = raw.split('/').filter(Boolean)
  if (parts.length !== 2) return null
  const channelId = sanitizePathSegment(parts[0]!, 64)
  const folderName = sanitizePathSegment(parts[1]!, 120)
  if (channelId !== parts[0] || folderName !== parts[1]) {
    // Reject keys that need rewriting (possible injection)
    if (
      sanitizePathSegment(parts[0]!) !== parts[0] ||
      sanitizePathSegment(parts[1]!) !== parts[1]
    ) {
      return null
    }
  }
  return { channelId: parts[0]!, folderName: parts[1]! }
}

export function logsRoot(): string {
  const root = join(app.getPath('userData'), 'moderation-logs')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

function isInsideRoot(root: string, target: string): boolean {
  const base = normalize(resolve(root) + sep)
  const full = normalize(resolve(target))
  return full === resolve(root) || full.startsWith(base)
}

/** Resolve path absoluto apenas se estiver dentro de moderation-logs. */
export function resolveInsideLogs(...segments: string[]): string | null {
  if (segments.some((s) => !s || String(s).includes('..') || String(s).includes(sep) || String(s).includes('/'))) {
    // allow only simple segments
    if (segments.some((s) => /[\\/]/.test(String(s)) || String(s).includes('..'))) {
      return null
    }
  }
  const root = resolve(logsRoot())
  const joined = resolve(root, ...segments.map(String))
  if (!isInsideRoot(root, joined)) return null
  return joined
}

export function resolveStreamDir(streamKey: string): string | null {
  const parts = splitStreamKey(streamKey)
  if (!parts) return null
  return resolveInsideLogs(parts.channelId, parts.folderName)
}
