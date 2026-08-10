import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../../i18n/i18n-renderer'
import type { PickerItem, PickerScope, PickerSource } from './emote-sources'
import { EmojiSourceIcon, SevenTvSourceIcon, YouTubeSourceIcon } from './EmoteSourceIcons'

type SourceButton = {
  source: PickerSource
  label: string
  icon: ReactElement | string
}

export function EmotePicker({
  open,
  source,
  scope,
  query,
  loading,
  items,
  onSource,
  onScope,
  onQuery,
  onClose,
  onPick
}: {
  open: boolean
  source: PickerSource
  scope: PickerScope
  query: string
  loading: boolean
  items: PickerItem[]
  onSource(source: PickerSource): void
  onScope(scope: PickerScope): void
  onQuery(query: string): void
  onClose(): void
  onPick(item: PickerItem): void
}): ReactElement | null {
  const { t } = useTranslation('chat', { i18n })
  if (!open) return null

  const sources: SourceButton[] = [
    { source: 'youtube', label: t('youtubeSource'), icon: <YouTubeSourceIcon /> },
    { source: 'emoji', label: t('emojiEmotes'), icon: <EmojiSourceIcon /> },
    { source: '7tv', label: '7TV', icon: <SevenTvSourceIcon /> }
  ]

  return (
    <div className="emote-picker" role="dialog" aria-label={t('emotes')}>
      <div className="emote-picker-head">
        <div className="emote-picker-sources" role="tablist">
          {sources.map((item) => (
            <button
              key={item.source}
              type="button"
              role="tab"
              data-source={item.source}
              aria-selected={source === item.source}
              className={'emote-picker-source' + (source === item.source ? ' active' : '')}
              onClick={() => onSource(item.source)}
              title={item.label}
            >
              <span className="emote-picker-source-icon" aria-hidden>{item.icon}</span>
              <span>{item.source === '7tv' ? '7TV' : item.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="emote-picker-close"
          onClick={onClose}
          aria-label={t('close')}
        >
          ×
        </button>
      </div>

      <div className="emote-picker-search-wrap">
        <span className="emote-picker-search-icon" aria-hidden>⌕</span>
        <input
          className="emote-picker-search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t('searchEmote')}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('searchEmote')}
        />
      </div>

      {source === '7tv' && (
        <div className="emote-picker-collections" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'channel'}
            className={'emote-picker-collection' + (scope === 'channel' ? ' active' : '')}
            onClick={() => onScope('channel')}
          >
            {t('channelEmotes')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'global'}
            className={'emote-picker-collection' + (scope === 'global' ? ' active' : '')}
            onClick={() => onScope('global')}
          >
            {t('globalEmotes')}
          </button>
        </div>
      )}

      <div className="emote-picker-grid" role="list">
        {loading && <div className="emote-picker-empty">{t('loadingEmotes')}</div>}
        {!loading && !items.length && (
          <div className="emote-picker-empty">
            {source === 'youtube'
              ? t('youtubeEmotesLoading')
              : source === '7tv'
                ? t('noGlobalEmotes')
                : t('noEmojiEmotes')}
          </div>
        )}
        {!loading && items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="listitem"
            data-emote-key={item.key}
            className={'emote-picker-item' + (item.zeroWidth ? ' zw' : '')}
            title={item.label + (item.zeroWidth ? ' (zero-width)' : '')}
            aria-label={item.label}
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(item)
            }}
          >
            {item.source === 'emoji' ? (
              <span className="emote-picker-emoji" aria-hidden>{item.insertText}</span>
            ) : (
              <img
                src={item.imageUrl}
                alt={item.label}
                loading="lazy"
                draggable={false}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
