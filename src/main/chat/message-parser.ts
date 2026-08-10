import { YTNodes } from 'youtubei.js'
import type { ChatMessage, ChatPart } from '../../shared/types'

export function textOf(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const o = value as { text?: string; toString?: () => string }
    if (typeof o.text === 'string') return o.text
    if (typeof o.toString === 'function') {
      const s = o.toString()
      if (s && s !== '[object Object]') return s
    }
  }
  return ''
}
export function normalizeThumbUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('http://')) return `https://${url.slice(7)}`
  return url
}

/** Prefere ~48–64px para chat; senão a maior disponível */
export function pickEmojiUrl(
  images: Array<{ url?: string; width?: number; height?: number }> | undefined
): string {
  if (!images?.length) return ''
  const valid = images
    .filter((t) => t?.url)
    .map((t) => ({
      url: normalizeThumbUrl(String(t.url)),
      width: t.width || 0
    }))
    .filter((t) => t.url)
  if (!valid.length) return ''
  const preferred =
    valid.find((t) => t.width >= 40 && t.width <= 72) ||
    valid.find((t) => t.width >= 24) ||
    [...valid].sort((a, b) => b.width - a.width)[0]
  return preferred?.url || ''
}

/**
 * Converte Text (youtubei) com runs em partes texto/emoji.
 * Emotes custom e unicode do YouTube vêm como EmojiRun com image[].
 */
export function messagePartsFrom(message: unknown): ChatPart[] {
  if (message == null) return []
  if (typeof message === 'string') {
    return message ? [{ type: 'text', text: message }] : []
  }

  const o = message as {
    runs?: Array<{
      text?: string
      emoji?: {
        emoji_id?: string
        shortcuts?: string[]
        image?: Array<{ url?: string; width?: number; height?: number }>
        is_custom?: boolean
      }
      toString?: () => string
    }>
    text?: string
    toString?: () => string
  }

  if (Array.isArray(o.runs) && o.runs.length > 0) {
    const parts: ChatPart[] = []
    for (const run of o.runs) {
      if (run?.emoji) {
        const url = pickEmojiUrl(run.emoji.image)
        const label =
          run.emoji.shortcuts?.[0] ||
          run.text ||
          run.emoji.emoji_id ||
          ''
        if (url) {
          parts.push({
            type: 'emoji',
            text: label,
            url,
            isCustom: !!run.emoji.is_custom,
            emojiId: run.emoji.emoji_id,
            provider: 'youtube'
          })
        } else if (label) {
          // sem imagem: mostra o atalho / unicode
          parts.push({ type: 'text', text: label })
        }
      } else {
        const t =
          typeof run?.text === 'string'
            ? run.text
            : typeof run?.toString === 'function'
              ? run.toString()
              : textOf(run)
        if (t) parts.push({ type: 'text', text: t })
      }
    }
    return mergeAdjacentTextParts(parts)
  }

  const plain = textOf(message)
  return plain ? [{ type: 'text', text: plain }] : []
}

export function mergeAdjacentTextParts(parts: ChatPart[]): ChatPart[] {
  const out: ChatPart[] = []
  for (const p of parts) {
    const last = out[out.length - 1]
    if (p.type === 'text' && last?.type === 'text') {
      last.text += p.text
    } else {
      out.push(p.type === 'text' ? { type: 'text', text: p.text } : { ...p })
    }
  }
  return out
}

export function plainFromParts(parts: ChatPart[]): string {
  return parts.map((p) => p.text).join('')
}

export function withLeadingText(prefix: string, parts: ChatPart[]): ChatPart[] {
  if (!prefix) return parts
  return mergeAdjacentTextParts([{ type: 'text', text: prefix }, ...parts])
}

export function badgeFlags(author: {
  is_moderator?: boolean
  is_verified?: boolean
  badges?: Array<{ icon_type?: string; style?: string; label?: string; tooltip?: string }>
}): { isModerator: boolean; isVerified: boolean; isMember: boolean; isOwner: boolean } {
  const badges = author.badges || []
  const joined = badges
    .map((b) => `${b.icon_type || ''} ${b.style || ''} ${b.label || ''} ${b.tooltip || ''}`)
    .join(' ')
    .toUpperCase()

  return {
    isModerator: !!author.is_moderator || joined.includes('MODERATOR'),
    isVerified: !!author.is_verified || joined.includes('VERIFIED'),
    isMember:
      joined.includes('SPONSOR') ||
      joined.includes('MEMBER') ||
      joined.includes('MEMBERSHIP') ||
      joined.includes('PURCHASED'),
    isOwner: joined.includes('OWNER') || joined.includes('CROWN')
  }
}

export function fromTextMessage(item: YTNodes.LiveChatTextMessage): ChatMessage {
  const flags = badgeFlags(item.author as never)
  const parts = messagePartsFrom(item.message)
  const text = plainFromParts(parts) || textOf(item.message)
  return {
    id: item.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    authorName: item.author?.name || 'Desconhecido',
    authorChannelId: item.author?.id,
    authorAvatarUrl: item.author?.best_thumbnail?.url || item.author?.thumbnails?.[0]?.url,
    text,
    parts: parts.length ? parts : undefined,
    timestamp: item.timestamp_usec
      ? Math.floor(Number(item.timestamp_usec) / 1000)
      : item.timestamp || Date.now(),
    isOwner: flags.isOwner,
    isModerator: flags.isModerator,
    isMember: flags.isMember,
    isVerified: flags.isVerified
  }
}

export function fromPaidMessage(item: YTNodes.LiveChatPaidMessage): ChatMessage {
  const base = fromTextMessage(item as unknown as YTNodes.LiveChatTextMessage)
  const amount = textOf(item.purchase_amount) || String(item.purchase_amount || '')
  const prefix = amount ? `[Super Chat ${amount}] ` : '[Super Chat] '
  base.text = `${prefix}${base.text}`.trim()
  base.parts = withLeadingText(prefix, base.parts || [{ type: 'text', text: base.text.slice(prefix.length) }])
  return base
}

export function fromMembership(item: YTNodes.LiveChatMembershipItem): ChatMessage {
  const flags = badgeFlags(item.author as never)
  const header = textOf(item.header_primary_text) || textOf(item.header_subtext) || 'Evento de membro'
  const bodyParts = messagePartsFrom(item.message)
  const bodyPlain = plainFromParts(bodyParts) || textOf(item.message)
  const prefix = bodyPlain ? `${header}: ` : header
  const parts = bodyPlain
    ? withLeadingText(`${header}: `, bodyParts)
    : ([{ type: 'text', text: header }] as ChatPart[])
  return {
    id: item.id || `mem-${Date.now()}`,
    authorName: item.author?.name || 'Membro',
    authorChannelId: item.author?.id,
    authorAvatarUrl: item.author?.best_thumbnail?.url || item.author?.thumbnails?.[0]?.url,
    text: bodyPlain ? `${header}: ${bodyPlain}` : header,
    parts,
    timestamp: item.timestamp_usec
      ? Math.floor(Number(item.timestamp_usec) / 1000)
      : item.timestamp || Date.now(),
    isMember: true,
    isModerator: flags.isModerator,
    isOwner: flags.isOwner
  }
}
