import { useEffect, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'
import { youtubeChannelUrl, type ChatUserProfileTarget } from '../../../../shared/channel-profile'

export function UserProfilePanel({
  target,
  onClose
}: {
  target: ChatUserProfileTarget
  onClose(): void
}): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  const channelUrl = youtubeChannelUrl(target.authorChannelId)
  const name = target.authorName.replace(/^@+/, '').trim() || t('unknownUser')

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="user-profile-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="user-profile-panel" role="dialog" aria-modal="true" aria-label={t('userProfile')}>
        <header className="user-profile-header">
          <strong>{t('userProfile')}</strong>
          <button type="button" onClick={onClose} aria-label={t('closeUserProfile')}>×</button>
        </header>
        <div className="user-profile-body">
          {target.authorAvatarUrl
            ? <img className="user-profile-avatar" src={target.authorAvatarUrl} alt="" />
            : <span className="user-profile-avatar user-profile-avatar-fallback" aria-hidden="true" />}
          <strong className="user-profile-name">@{name}</strong>
          {channelUrl
            ? <a data-yubblo-open-channel href={channelUrl} target="_blank" rel="noreferrer" className="user-profile-channel-link">{t('openChannel')}</a>
            : <span className="user-profile-unavailable">{t('channelLinkUnavailable')}</span>}
        </div>
      </section>
    </div>
  )
}
