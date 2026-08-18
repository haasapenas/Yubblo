import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../../i18n/i18n-renderer'
import { EmotePicker } from './EmotePicker'
import { MentionPicker } from './MentionPicker'
import { useComposer, type ComposerProps } from './use-composer'

export type { ChatAuthor } from './MentionPicker'
export type { ComposerProps, ComposerReplyRequest } from './use-composer'

export function composerPlaceholderKey(
  authLoggedIn: boolean,
  hasActiveChat: boolean
): 'loginToSend' | 'openLive' | 'sendMessage' {
  if (!authLoggedIn) return 'loginToSend'
  return hasActiveChat ? 'sendMessage' : 'openLive'
}
export const Composer = memo(function Composer(props: ComposerProps) {
  const { t } = useTranslation('chat', { i18n })
  const {
    canChat, authLoggedIn, activeVideoId, slowModeSeconds,
    draft, inputRef, sendBlocked, sendCooldownRemaining,
    mentionOpen, mentionQuery, mentionSuggestions, mentionIndex, setMentionIndex,
    emotePickerOpen, setEmotePickerOpen, emoteSource, setEmoteSource,
    emoteScope, setEmoteScope, emoteQuery, setEmoteQuery, emoteCatalog,
    emoteLoading, emoteItems,
    applyMention, insertEmote, toggleEmotePicker, handleSend,
    handleDraftChange, handleComposerKeyDown, updateMentionFromDraft
  } = useComposer(props)

  return (
    <form
      className={`composer${sendBlocked ? ' is-cooldown' : ''}`}
      onSubmit={(e) => void handleSend(e)}
    >
      <div className="composer-bar">
        {sendBlocked ? (
          <div className="composer-cooldown-overlay" role="status" aria-live="polite">
            <span className="composer-cooldown-label">
              {slowModeSeconds > 0
                ? t('slowWait', { seconds: sendCooldownRemaining })
                : t('wait', { seconds: sendCooldownRemaining })}
            </span>
          </div>
        ) : null}
        <div className="composer-field">
          <MentionPicker
            open={mentionOpen}
            query={mentionQuery}
            authors={mentionSuggestions}
            activeIndex={mentionIndex}
            onPick={applyMention}
            onHover={setMentionIndex}
          />
          <EmotePicker
            open={emotePickerOpen}
            source={emoteSource}
            scope={emoteScope}
            query={emoteQuery}
            loading={emoteLoading}
            items={emoteItems}
            onSource={setEmoteSource}
            onScope={setEmoteScope}
            onQuery={setEmoteQuery}
            onClose={() => setEmotePickerOpen(false)}
            onPick={insertEmote}
          />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) =>
              handleDraftChange(
                e.target.value,
                e.target.selectionStart ?? e.target.value.length
              )
            }
            onKeyDown={handleComposerKeyDown}
            onClick={(e) => {
              const t = e.currentTarget
              updateMentionFromDraft(t.value, t.selectionStart ?? t.value.length)
            }}
            onKeyUp={(e) => {
              const t = e.currentTarget
              if (
                e.key === 'ArrowLeft' ||
                e.key === 'ArrowRight' ||
                e.key === 'Home' ||
                e.key === 'End'
              ) {
                updateMentionFromDraft(t.value, t.selectionStart ?? t.value.length)
              }
            }}
            placeholder={t(composerPlaceholderKey(authLoggedIn, !!activeVideoId))}
            disabled={!canChat || sendBlocked}
            aria-hidden={sendBlocked || undefined}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="send"
          />
        </div>
        <div className="composer-actions">
          <button
            type="button"
            className={`composer-emote-btn${emotePickerOpen ? ' active' : ''}`}
            title={t('emotes')}
            disabled={!authLoggedIn || !activeVideoId || sendBlocked}
            onClick={() => void toggleEmotePicker()}
            aria-label={t('emotes')}
            aria-expanded={emotePickerOpen}
          >
            <svg className="composer-emote-icon" viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="8.5" />
              <circle cx="9" cy="10" r="0.8" className="composer-emote-eye" />
              <circle cx="15" cy="10" r="0.8" className="composer-emote-eye" />
              <path d="M8.5 14c1 1.3 2.1 2 3.5 2s2.5-.7 3.5-2" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  )
})
