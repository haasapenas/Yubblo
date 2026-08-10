import type { ReactElement } from 'react'
import type { LivePollState } from '../../../../shared/types'
import { LIVE_POLLS_ENABLED } from '../../../../shared/feature-flags'

export function LivePollBanner({
  poll,
  activeVideoId,
  busyOptionId,
  onVote,
  onDismiss
}: {
  poll: LivePollState | null
  activeVideoId: string | null
  busyOptionId: string | null
  onVote(optionId: string): void
  onDismiss(): void
}): ReactElement | null {
  if (
    !LIVE_POLLS_ENABLED ||
    !poll ||
    (poll.videoId && poll.videoId !== activeVideoId)
  ) return null
  return (
    <div
      className={`live-poll-banner${poll.closed ? ' closed' : ''}${poll.selectedOptionId ? ' voted' : ''}`}
      role="region"
      aria-label="Enquete da live"
    >
      <div className="live-poll-head">
        <span className="live-poll-badge">{poll.closed ? 'Enquete encerrada' : 'Enquete'}</span>
        <div className="live-poll-head-right">
          {poll.totalVotes ? <span className="live-poll-total">{poll.totalVotes}</span> : null}
          <button type="button" className="live-poll-close" onClick={onDismiss}>×</button>
        </div>
      </div>
      <div className="live-poll-question">{poll.question || 'Enquete'}</div>
      <div className="live-poll-choices">
        {poll.choices.map((choice) => {
          const selected = poll.selectedOptionId === choice.optionId
          const ratio = typeof choice.voteRatio === 'number'
            ? Math.max(0, Math.min(1, choice.voteRatio))
            : choice.votePercent
              ? Math.min(1, Math.max(0, parseInt(choice.votePercent, 10) / 100))
              : 0
          const busy = busyOptionId === choice.optionId
          const canVote = !poll.closed && !poll.selectedOptionId && !busyOptionId
          return (
            <button
              key={choice.optionId}
              type="button"
              className={`live-poll-choice${selected ? ' selected' : ''}`}
              disabled={!canVote && !selected}
              onClick={() => onVote(choice.optionId)}
            >
              <span className="live-poll-bar" style={{ width: `${Math.round(ratio * 100)}%` }} />
              <span className="live-poll-choice-text">
                {busy ? '… ' : selected ? '✓ ' : ''}{choice.text}
              </span>
              <span className="live-poll-choice-pct">
                {choice.votePercent && !/^n\/?a$/i.test(choice.votePercent)
                  ? choice.votePercent
                  : typeof choice.voteRatio === 'number'
                    ? `${Math.round((choice.voteRatio > 1 ? choice.voteRatio : choice.voteRatio * 100))}%`
                    : '—'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
