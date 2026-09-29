export const APP_BADGE_IDS = ['dev'] as const
export type AppBadgeId = (typeof APP_BADGE_IDS)[number]

export type AppBadgeMap = Record<string, AppBadgeId>

export const APP_BADGES_URL = 'https://raw.githubusercontent.com/haasapenas/Yubblo/main/badges.json'

function isBadgeId(value: unknown): value is AppBadgeId {
  return typeof value === 'string' && (APP_BADGE_IDS as readonly string[]).includes(value)
}

function isChannelId(value: unknown): value is string {
  return typeof value === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(value)
}

export function parseAppBadges(raw: unknown): AppBadgeMap | null {
  if (!raw || typeof raw !== 'object') return null
  const badges = (raw as { badges?: unknown }).badges
  if (!Array.isArray(badges)) return null
  const map: AppBadgeMap = {}
  for (const entry of badges) {
    if (!entry || typeof entry !== 'object') continue
    const { id, users } = entry as { id?: unknown; users?: unknown }
    if (!isBadgeId(id) || !Array.isArray(users)) continue
    for (const user of users) {
      if (isChannelId(user) && !map[user]) map[user] = id
    }
  }
  return map
}
