import { memo, type ReactElement } from 'react'
import type { ChatPart } from '../../../../shared/types'
import { groupMessageParts } from './message-emote-groups'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

type EmojiPart = Extract<ChatPart, { type: 'emoji' }>

function renderEmote(part: EmojiPart, index: number, extraClass = ''): ReactElement {
  return (
    <img
      key={`e-${index}-${part.emojiId || part.text}`}
      className={[
        'msg-emote',
        part.isCustom ? 'custom' : '',
        part.provider === '7tv' ? 'stv' : '',
        extraClass
      ].filter(Boolean).join(' ')}
      src={part.url}
      alt={part.text}
      title={part.provider === '7tv' ? `${part.text} (7TV)` : part.text}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={(event) => {
        const element = event.currentTarget
        element.style.display = 'none'
        if (element.dataset.fallbackInserted === 'true') return
        element.dataset.fallbackInserted = 'true'
        const fallback = document.createElement('span')
        fallback.className = 'msg-emote-fallback'
        fallback.textContent = part.text || '□'
        element.parentElement?.insertBefore(fallback, element.nextSibling)
      }}
    />
  )
}

export interface MessageBodyProps {
  text: string
  parts?: ChatPart[]
  removed?: boolean
}

export const MessageBody = memo(function MessageBody({
  text,
  parts,
  removed
}: MessageBodyProps): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  if (removed) {
    return <span className="msg-removed-text">{text || t('removedFallback')}</span>
  }
  if (!parts?.length) {
    return <span className="msg-text">{text}</span>
  }
  const visualParts = groupMessageParts(parts)
  return (
    <span className="msg-text">
      {visualParts.map((visual) => {
        if (visual.kind === 'text') {
          if (visual.part.url) {
            return (
              <a
                key={`t-${visual.index}`}
                className="msg-link"
                href={visual.part.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {visual.part.text}
              </a>
            )
          }
          return (
            <span key={`t-${visual.index}`} className="msg-text-run">
              {visual.part.text}
            </span>
          )
        }
        if (visual.kind === 'emote') return renderEmote(visual.part, visual.index)
        return (
          <span key={`s-${visual.baseIndex}`} className="msg-emote-stack">
            {renderEmote(visual.base, visual.baseIndex, 'msg-emote-base')}
            {visual.overlays.map(({ part, index }) =>
              renderEmote(part, index, 'msg-emote-overlay')
            )}
          </span>
        )
      })}
    </span>
  )
})
