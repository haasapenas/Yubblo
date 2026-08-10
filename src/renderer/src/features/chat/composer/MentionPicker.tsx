import type { ReactElement } from 'react'

export interface ChatAuthor {
  key: string
  name: string
  channelId?: string
  lastSeen: number
}

export function MentionPicker({
  open,
  query,
  authors,
  activeIndex,
  onPick,
  onHover
}: {
  open: boolean
  query: string
  authors: ChatAuthor[]
  activeIndex: number
  onPick(author: ChatAuthor): void
  onHover(index: number): void
}): ReactElement | null {
  if (!open) return null
  if (!authors.length) {
    return query ? (
      <div className="mention-menu mention-empty">
        Ninguém com “{query}” no chat recente
      </div>
    ) : null
  }
  return (
    <div className="mention-menu" role="listbox">
      <div className="mention-menu-title">Menções</div>
      {authors.map((author, index) => (
        <button
          key={author.key}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`mention-item${index === activeIndex ? ' active' : ''}`}
          onMouseDown={(event) => {
            event.preventDefault()
            onPick(author)
          }}
          onMouseEnter={() => onHover(index)}
        >
          <span className="mention-at">@</span>
          <span className="mention-name">{author.name.replace(/^@/, '')}</span>
        </button>
      ))}
    </div>
  )
}
