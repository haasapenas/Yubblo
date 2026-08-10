import { useEffect, useRef, type FormEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

export interface ChatSearchBarProps {
  open: boolean
  query: string
  matchCount: number
  /** 0-based index into matches; -1 se nenhum */
  activeMatch: number
  onQueryChange(value: string): void
  onNext(): void
  onPrev(): void
  onClose(): void
}

/**
 * Barra de busca no chat acionada por Ctrl+F.
 */
export function ChatSearchBar(props: ChatSearchBarProps): ReactElement | null {
  const {
    open,
    query,
    matchCount,
    activeMatch,
    onQueryChange,
    onNext,
    onPrev,
    onClose
  } = props
  const { t } = useTranslation('chat', { i18n })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 30)
    return () => window.clearTimeout(id)
  }, [open])

  if (!open) return null

  function onSubmit(e: FormEvent): void {
    e.preventDefault()
    onNext()
  }

  const label =
    matchCount === 0
      ? query.trim()
        ? t('searchNoResults')
        : t('searchType')
      : t('searchMatchCount', {
          current: activeMatch + 1,
          total: matchCount
        })

  return (
    <form className="chat-search-bar" onSubmit={onSubmit} role="search">
      <div className="chat-search-row">
        <span className="chat-search-icon" aria-hidden>
          ⌕
        </span>
        <input
          ref={inputRef}
          type="search"
          className="chat-search-input"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          aria-label={t('searchPlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey) onPrev()
              else onNext()
            }
            if (e.key === 'F3') {
              e.preventDefault()
              if (e.shiftKey) onPrev()
              else onNext()
            }
          }}
        />
        <span className="chat-search-count" aria-live="polite">
          {label}
        </span>
        <button
          type="button"
          className="chat-search-nav"
          title={t('searchPrev')}
          aria-label={t('searchPrev')}
          disabled={matchCount === 0}
          onClick={onPrev}
        >
          ▲
        </button>
        <button
          type="button"
          className="chat-search-nav"
          title={t('searchNext')}
          aria-label={t('searchNext')}
          disabled={matchCount === 0}
          onClick={onNext}
        >
          ▼
        </button>
        <button
          type="button"
          className="chat-search-close"
          title={t('searchClose')}
          aria-label={t('searchClose')}
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </form>
  )
}
