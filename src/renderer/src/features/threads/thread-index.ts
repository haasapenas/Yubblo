import type { ChatMessage } from '../../../../shared/types'

export const THREAD_LOOKBACK_MS = 60_000
export const THREAD_LOCAL_REPLY_MS = 600_000
const EXCERPT_MAX = 80

export interface ThreadLink {
  parentId: string
  rootId: string
  parentAuthorName: string
  parentExcerpt: string
}

export interface ThreadIndex {
  links: ReadonlyMap<string, ThreadLink>
}

export const EMPTY_THREAD_INDEX: ThreadIndex = { links: new Map() }

export function normalizeThreadName(name: string | undefined): string {
  return (name || '').trim().replace(/^@+/, '').toLocaleLowerCase()
}

export function firstMention(text: string | undefined): string {
  const match = /(?:^|\s)@([^\s@,:;!?]+)/.exec(text || '')
  return match ? normalizeThreadName(match[1]) : ''
}

function canJoinThread(message: ChatMessage): boolean {
  return !message.systemKind &&
    !message.heldForReview &&
    !message.pending &&
    !message.failed &&
    !message.awaitingEcho &&
    !!message.authorName
}

function sameAuthor(a: ChatMessage, b: ChatMessage): boolean {
  if (a.authorChannelId && b.authorChannelId) return a.authorChannelId === b.authorChannelId
  return normalizeThreadName(a.authorName) === normalizeThreadName(b.authorName)
}

function excerptOf(message: ChatMessage): string {
  const text = (message.text || '').replace(/\s+/g, ' ').trim()
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text
}

export function buildThreadIndex(
  messages: readonly ChatMessage[],
  localReplyTargets: ReadonlyMap<string, string> = new Map()
): ThreadIndex {
  const links = new Map<string, ThreadLink>()
  const byId = new Map<string, ChatMessage>()
  const lastByAuthor = new Map<string, ChatMessage>()

  for (const message of messages) {
    if (!canJoinThread(message)) continue

    const mention = firstMention(message.text)
    if (mention) {
      const localId = message.isSelf ? localReplyTargets.get(mention) : undefined
      const local = localId ? byId.get(localId) : undefined
      const parent =
        local && message.timestamp - local.timestamp <= THREAD_LOCAL_REPLY_MS
          ? local
          : lastByAuthor.get(mention)
      if (
        parent &&
        !sameAuthor(parent, message) &&
        message.timestamp - parent.timestamp <= (parent === local ? THREAD_LOCAL_REPLY_MS : THREAD_LOOKBACK_MS)
      ) {
        links.set(message.id, {
          parentId: parent.id,
          rootId: links.get(parent.id)?.rootId ?? parent.id,
          parentAuthorName: parent.authorName,
          parentExcerpt: excerptOf(parent)
        })
      }
    }

    byId.set(message.id, message)
    const author = normalizeThreadName(message.authorName)
    if (author) lastByAuthor.set(author, message)
  }

  return { links }
}

export function collectThread(
  messages: readonly ChatMessage[],
  index: ThreadIndex,
  rootId: string
): ChatMessage[] {
  return messages.filter((message) =>
    message.id === rootId || index.links.get(message.id)?.rootId === rootId
  )
}
