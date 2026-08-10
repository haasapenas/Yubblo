import type { ChatPart } from '../../shared/types'

export type YoutubeMessageSegment =
  | { text: string }
  | { emojiId: string }

export type YoutubeEmojiDefinition = {
  id: string
  name: string
  url: string
  isCustom: boolean
}

export type CompiledYoutubeMessage = {
  segments: YoutubeMessageSegment[]
  parts: ChatPart[]
  hasYoutubeEmoji: boolean
}

function escapeRegex(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

export function compileYoutubeMessage(
  text: string,
  emojis: Iterable<YoutubeEmojiDefinition>
): CompiledYoutubeMessage {
  const byShortcut = new Map<string, YoutubeEmojiDefinition>()
  for (const emoji of emojis) {
    if (!emoji.id || !emoji.name || !emoji.url) continue
    if (!byShortcut.has(emoji.name)) {
      byShortcut.set(emoji.name, emoji)
    }
  }

  if (!text || byShortcut.size === 0) {
    return {
      segments: text ? [{ text }] : [],
      parts: text ? [{ type: 'text', text }] : [],
      hasYoutubeEmoji: false
    }
  }

  const alternatives = [...byShortcut.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
  const matcher = new RegExp(alternatives.join('|'), 'g')
  const segments: YoutubeMessageSegment[] = []
  const parts: ChatPart[] = []
  let cursor = 0
  let hasYoutubeEmoji = false

  const pushText = (value: string): void => {
    if (!value) return
    const previousSegment = segments.at(-1)
    if (previousSegment && 'text' in previousSegment) {
      previousSegment.text += value
    } else {
      segments.push({ text: value })
    }

    const previousPart = parts.at(-1)
    if (previousPart?.type === 'text') {
      previousPart.text += value
    } else {
      parts.push({ type: 'text', text: value })
    }
  }

  for (const match of text.matchAll(matcher)) {
    const index = match.index
    const shortcut = match[0]
    if (index == null) continue
    pushText(text.slice(cursor, index))

    const emoji = byShortcut.get(shortcut)
    if (!emoji) {
      pushText(shortcut)
    } else {
      segments.push({ emojiId: emoji.id })
      parts.push({
        type: 'emoji',
        text: shortcut,
        url: emoji.url,
        isCustom: emoji.isCustom,
        emojiId: emoji.id,
        provider: 'youtube'
      })
      hasYoutubeEmoji = true
    }
    cursor = index + shortcut.length
  }

  pushText(text.slice(cursor))

  return {
    segments,
    parts,
    hasYoutubeEmoji
  }
}
