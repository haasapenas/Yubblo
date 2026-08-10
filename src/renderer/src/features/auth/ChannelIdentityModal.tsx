import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'
import type { YtChannelIdentity } from '../../../../shared/types'

export interface ChannelIdentityModalProps {
  open: boolean
  loading: boolean
  busy: boolean
  identities: YtChannelIdentity[]
  onClose(): void
  onChoose(identityId: string): void
}

export function ChannelIdentityModal(props: ChannelIdentityModalProps): ReactElement | null {
  const { open, loading, busy, identities, onClose, onChoose } = props
  const { t } = useTranslation('auth', { i18n })
  if (!open) return null
  return (
    <>
      <div className='account-menu-backdrop' style={{ zIndex: 60 }} onClick={() => { if (!busy) onClose() }} />
      <div className='channel-identity-modal' role='dialog' aria-label={t('channelsTitle')}>
        <div className='channel-identity-head'>
          <div>
            <h2>{t('channelsTitle')}</h2>
            <p>{t('channelsHelp')}</p>
          </div>
          <button type='button' className='emote-picker-close' disabled={busy} onClick={onClose}>×</button>
        </div>
        <div className='channel-identity-list'>
          {loading && <div className='channel-identity-empty'>{t('loadingChannels')}</div>}
          {!loading && identities.length === 0 && <div className='channel-identity-empty'>{t('noChannels')}</div>}
          {!loading && identities.map((identity) => (
            <button
              key={identity.id}
              type='button'
              className={`channel-identity-item${identity.isSelected ? ' selected' : ''}`}
              disabled={busy}
              onClick={() => onChoose(identity.id)}
            >
              {identity.avatarUrl ? <img src={identity.avatarUrl} alt='' /> : <div className='account-menu-avatar' />}
              <span className='channel-identity-meta'>
                <strong>{identity.name}</strong>
                <small>
                  {identity.handle ? `@${identity.handle.replace(/^@/, '')}` : identity.byline || identity.id}
                  {identity.isSelected ? ` · ${t('inUse')}` : ''}
                </small>
              </span>
              {identity.isSelected && <span className='channel-identity-check'>✓</span>}
            </button>
          ))}
        </div>
        {busy && <div className='channel-identity-foot'>{t('switchingChannel')}</div>}
      </div>
    </>
  )
}
