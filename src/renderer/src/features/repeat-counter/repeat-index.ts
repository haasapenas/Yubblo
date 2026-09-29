import type { ChatMessage } from '../../../../shared/types'

export const REPEAT_WINDOW_MS = 120_000
export const REPEAT_SIMILARITY = 0.8
const MAX_COMPARE_LENGTH = 300
const EXACT_ONLY_BELOW = 4

export const EMPTY_REPEAT_COUNTS: ReadonlyMap<string, number> = new Map()

export function normalizeRepeatText(text: string | undefined): string {
  const raw = (text || '').trim().toLocaleLowerCase()
  const cleaned = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/(.)\1{2,}/gu, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || raw.replace(/\s+/g, ' ')).slice(0, MAX_COMPARE_LENGTH)
}

function bigrams(text: string): Map<string, number> {
  const grams = new Map<string, number>()
  for (let index = 0; index < text.length - 1; index++) {
    const gram = text.slice(index, index + 2)
    grams.set(gram, (grams.get(gram) || 0) + 1)
  }
  return grams
}

export function repeatSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < EXACT_ONLY_BELOW || b.length < EXACT_ONLY_BELOW) return 0
  const left = bigrams(a)
  const right = bigrams(b)
  let shared = 0
  for (const [gram, count] of left) {
    shared += Math.min(count, right.get(gram) || 0)
  }
  return (2 * shared) / (a.length - 1 + b.length - 1)
}

function countsTowardRepeat(message: ChatMessage): boolean {
  return !message.systemKind &&
    !message.heldForReview &&
    !message.pending &&
    !message.failed &&
    !message.awaitingEcho &&
    !!message.authorName
}

function authorKey(message: ChatMessage): string {
  return message.authorChannelId || message.authorName.trim().replace(/^@+/, '').toLocaleLowerCase()
}

export function buildRepeatCounts(messages: readonly ChatMessage[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  const lastByAuthor = new Map<string, { text: string; timestamp: number; count: number }>()

  for (const message of messages) {
    if (!countsTowardRepeat(message)) continue
    const key = authorKey(message)
    const text = normalizeRepeatText(message.text)
    if (!key || !text) continue

    const previous = lastByAuthor.get(key)
    const repeated =
      !!previous &&
      message.timestamp - previous.timestamp <= REPEAT_WINDOW_MS &&
      repeatSimilarity(previous.text, text) >= REPEAT_SIMILARITY
    const count = repeated ? previous.count + 1 : 1

    if (count > 1) counts.set(message.id, count)
    lastByAuthor.set(key, { text, timestamp: message.timestamp, count })
  }

  return counts
}
