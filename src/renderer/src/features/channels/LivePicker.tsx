import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { LiveStreamOption } from '../../../../shared/types'
import { i18n } from '../../i18n/i18n-renderer'

export interface LivePickerState {
  channelLabel: string
  input: string
  lives: LiveStreamOption[]
}

export interface LivePickerProps {
  picker: LivePickerState | null
  activeVideoId: string | null
  busyVideoId: string | null
  onClose(): void
  onPick(live: LiveStreamOption): void
}

export function LivePicker({
  picker,
  activeVideoId,
  busyVideoId,
  onClose,
  onPick
}: LivePickerProps): ReactElement | null {
  const { t } = useTranslation('channels', { i18n })
  if (!picker) return null

  return (
    <>
      <div
        className="account-menu-backdrop"
        style={{ zIndex: 60 }}
        onClick={() => { if (!busyVideoId) onClose() }}
      />
      <div
        className="channel-identity-modal live-picker-modal"
        role="dialog"
        aria-label={t('chooseLive')}
      >
        <div className="channel-identity-head">
          <div>
            <h2>{t('chooseLive')}</h2>
            <p>
              {t('pickerHelp', {
                channel: picker.channelLabel,
                count: picker.lives.length
              })}
            </p>
          </div>
          <button
            type="button"
            className="emote-picker-close"
            disabled={!!busyVideoId}
            onClick={onClose}
            aria-label={t('close')}
          >
            ×
          </button>
        </div>
        <div className="channel-identity-list">
          {picker.lives.map((live) => {
            const busy = busyVideoId === live.videoId
            const current = live.videoId === activeVideoId
            return (
              <button
                key={live.videoId}
                type="button"
                className={`channel-identity-item live-picker-item${current ? ' selected' : ''}`}
                disabled={!!busyVideoId}
                onClick={() => onPick(live)}
              >
                {live.thumbnailUrl ? (
                  <img className="live-picker-thumb" src={live.thumbnailUrl} alt="" />
                ) : (
                  <div className="live-picker-thumb placeholder" />
                )}
                <span className="channel-identity-meta">
                  <strong>{live.title}</strong>
                  <small>
                    {current
                      ? t('current')
                      : live.isLive !== false
                        ? t('live')
                        : t('stream')}
                    {live.viewerText ? ` · ${live.viewerText}` : ''}
                    {busy ? ` · ${t('opening')}` : ''}
                  </small>
                </span>
                {busy ? (
                  <span className="channel-identity-check">…</span>
                ) : current ? (
                  <span className="channel-identity-check">✓</span>
                ) : (
                  <span className="live-picker-go">{t('open')}</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="channel-identity-foot">{t('directLinkHelp')}</div>
      </div>
    </>
  )
}
