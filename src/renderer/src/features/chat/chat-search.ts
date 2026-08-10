import type { ChatMessage } from '../../../../shared/types'

/** Texto pesquisável de uma mensagem (autor + corpo). */
export function messageSearchText(msg: ChatMessage): string {
  const author = (msg.authorName || '').replace(/^@/, '')
  const text = msg.text || ''
  const header = msg.heldHeader || ''
  return `${author} ${text} ${header}`.trim()
}

export function messageMatchesQuery(msg: ChatMessage, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return messageSearchText(msg).toLowerCase().includes(q)
}

/** Índices de mensagens que batem com a query (ordem do feed). */
export function findSearchMatchIndexes(
  messages: readonly ChatMessage[],
  query: string
): number[] {
  const q = query.trim().toLowerCase()
  if (!q || messages.length === 0) return []
  const out: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messageSearchText(messages[i]!).toLowerCase().includes(q)) {
      out.push(i)
    }
  }
  return out
}

export function nextMatchIndex(
  matches: readonly number[],
  current: number,
  direction: 1 | -1
): number {
  if (matches.length === 0) return -1
  if (current < 0) return direction === 1 ? 0 : matches.length - 1
  const next = current + direction
  if (next < 0) return matches.length - 1
  if (next >= matches.length) return 0
  return next
}
