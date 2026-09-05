import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ChatActionButton, ChatSearchEntry, ChatSearchWindowState } from '../../../../shared/types'
import { messageMatchesQuery } from '../chat/chat-search'
import {
  canModerateSearchEntry,
  dropAfterSearchAction,
  includeInChatSearch,
  runSearchModeration
} from './search-moderation'
import { actionButtonFace } from '../moderation/DeleteActionIcon'

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
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return window.chatSearch.onState((next) => {
      setState(next)
      // não limpa a query ao atualizar o histórico
    })
  }, [])

  function runAction(entry: ChatSearchEntry, button: ChatActionButton): void {
    if (!state?.videoId) return
    setError(null)
    setBusyId(entry.id)
    void runSearchModeration(window.chatSearch, state.videoId, entry, button)
      .then(() => {
        setState((prev) =>
          prev ? { ...prev, messages: dropAfterSearchAction(prev.messages, entry, button) } : prev
        )
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusyId(null))
  }

  const searchable = useMemo(
    () => (state ? state.messages.filter(includeInChatSearch) : []),
    [state]
  )

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return searchable
    return searchable.filter((m) =>
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
  }, [searchable, query])

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
  const showActions = state.canModerate && state.actionButtons.length > 0

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
            ? `${filtered.length} result${filtered.length === 1 ? '' : 's'} · ${searchable.length} messages`
            : `${searchable.length} messages — type to filter`}
        </div>
      </div>
      {error ? <p className="chat-search-error" role="alert">{error}</p> : null}
      <div className="chat-search-list">
        {filtered.length === 0 ? (
          <div className="chat-search-empty">
            {query.trim() ? 'No results' : 'No messages in this chat yet'}
          </div>
        ) : (
          filtered.map((m) => {
            const rowHasActions =
              showActions && canModerateSearchEntry(m, state.canModerate)
            return (
            <div
              key={m.id}
              className={[
                'chat-search-row',
                rowHasActions ? 'has-actions' : '',
                m.systemKind ? 'system' : '',
                m.removed ? 'removed' : ''
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="chat-search-time">{formatTime(m.timestamp)}</div>
              <div className="chat-search-body">
                {!m.systemKind && m.authorName ? (
                  <span className={`chat-search-author ${authorClass(m)}`}>
                    {m.authorName.startsWith('@') ? m.authorName : `@${m.authorName}`}:
                  </span>
                ) : null}
                <span className="chat-search-text">
                  {highlightText(m.text || '', query)}
                </span>
              </div>
              {rowHasActions ? (
                <div className="chat-search-actions">
                  {state.actionButtons.map((button) => (
                    <button
                      key={button.id}
                      type="button"
                      className={`chat-search-action kind-${button.kind}`}
                      disabled={busyId === m.id || !state.videoId}
                      onClick={() => runAction(m, button)}
                    >
                      {actionButtonFace(button.kind, button.label, busyId === m.id)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            )
          })
        )}
      </div>
    </main>
  )
}
