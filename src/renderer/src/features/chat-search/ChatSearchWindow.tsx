import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ChatSearchEntry, ChatSearchWindowState } from '../../../../shared/types'
import { messageMatchesQuery } from '../chat/chat-search'

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  } catch {
    return ''
  }
}

function highlightText(text: string, query: string): ReactElement {
  const q = query.trim()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: ReactElement[] = []
  let start = 0
  let i = 0
  let key = 0
  while ((i = lower.indexOf(needle, start)) >= 0) {
    if (i > start) parts.push(<span key={key++}>{text.slice(start, i)}</span>)
    parts.push(<mark key={key++}>{text.slice(i, i + q.length)}</mark>)
    start = i + q.length
  }
  if (start < text.length) parts.push(<span key={key++}>{text.slice(start)}</span>)
  return <>{parts}</>
}

function authorClass(m: ChatSearchEntry): string {
  if (m.isSelf) return 'self'
  if (m.isOwner) return 'owner'
  if (m.isModerator) return 'mod'
  if (m.isMember) return 'member'
  return ''
}

export function ChatSearchWindow(): ReactElement {
  const [state, setState] = useState<ChatSearchWindowState | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    return window.chatSearch.onState((next) => {
      setState(next)
      // não limpa a query ao atualizar o histórico
    })
  }, [])

  const filtered = useMemo(() => {
    if (!state) return [] as ChatSearchEntry[]
    const q = query.trim()
    if (!q) return state.messages
    return state.messages.filter((m) =>
      messageMatchesQuery(
        {
          id: m.id,
          authorName: m.authorName,
          text: m.text,
          timestamp: m.timestamp
        },
        q
      )
    )
  }, [state, query])

  if (!state) {
    return (
      <main className="chat-search-window">
        <header>
          <strong>Search chat</strong>
        </header>
        <div className="chat-search-empty">Loading…</div>
      </main>
    )
  }

  const label = state.channelLabel.replace(/^@/, '')

  return (
    <main className="chat-search-window">
      <header>
        <strong title={label}>Searching in {label}&apos;s history</strong>
      </header>
      <div className="chat-search-toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search"
          spellCheck={false}
          autoFocus
        />
        <div className="chat-search-meta">
          {query.trim()
            ? `${filtered.length} result${filtered.length === 1 ? '' : 's'} · ${state.messages.length} messages`
            : `${state.messages.length} messages — type to filter`}
        </div>
      </div>
      <div className="chat-search-list">
        {filtered.length === 0 ? (
          <div className="chat-search-empty">
            {query.trim() ? 'No results' : 'No messages in this chat yet'}
          </div>
        ) : (
          filtered.map((m) => (
            <div
              key={m.id}
              className={[
                'chat-search-row',
                m.systemKind ? 'system' : '',
                m.removed ? 'removed' : ''
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="chat-search-time">{formatTime(m.timestamp)}</div>
              <div>
                {!m.systemKind && m.authorName ? (
                  <span className={`chat-search-author ${authorClass(m)}`}>
                    {m.authorName.startsWith('@') ? m.authorName : `@${m.authorName}`}:
                  </span>
                ) : null}
                <span className="chat-search-text">
                  {highlightText(m.text || '', query)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  )
}
