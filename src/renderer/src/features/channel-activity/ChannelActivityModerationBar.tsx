import type { ChannelActivityModerationRequest, ChannelActivityModerationState, ChannelActivityTarget } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

interface Props {
  target: ChannelActivityTarget
  moderation: ChannelActivityModerationState
  onRun(request: ChannelActivityModerationRequest): void
}

export function ChannelActivityModerationBar({ target, moderation, onRun }: Props) {
  const { t } = useTranslation('channelActivity', { i18n })
  const blocked = Boolean(moderation.busyActionId || moderation.completedKind)
  const feedback = moderation.completedKind === 'hide'
    ? t('banApplied')
    : moderation.completedKind === 'timeout'
      ? t('timeoutApplied')
      : moderation.error
        ? t('moderationFailed')
        : null
  return <section className="channel-activity-moderation" aria-label={t('moderationActions')}>
    <div className="channel-activity-moderation-actions">
      {moderation.actions.map((action) => <button
        key={action.id}
        type="button"
        className={`channel-activity-mod-action kind-${action.kind}`}
        disabled={Boolean(moderation.completedKind) || moderation.busyActionId === action.id}
        onClick={() => onRun({ ...target, iconType: action.iconType })}
      >{moderation.busyActionId === action.id ? t('running') : action.kind === 'hide' ? t('ban') : action.label}</button>)}
    </div>
    {feedback && <p className={moderation.error ? 'error' : 'success'} aria-live="polite">{feedback}</p>}
  </section>
}