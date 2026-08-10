import type { ReactElement } from 'react'
import type { LiveStreamOption } from '../../../../shared/types'

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
        aria-label="Escolher transmissão"
      >
        <div className="channel-identity-head">
          <div>
            <h2>Escolher transmissão</h2>
            <p>
              <strong>{picker.channelLabel}</strong> tem {picker.lives.length} lives.
              Qual chat queres abrir?
            </p>
          </div>
          <button
            type="button"
            className="emote-picker-close"
            disabled={!!busyVideoId}
            onClick={onClose}
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
                    {current ? 'Atual' : live.isLive !== false ? 'Ao vivo' : 'Transmissão'}
                    {live.viewerText ? ` · ${live.viewerText}` : ''}
                    {busy ? ' · abrindo…' : ''}
                  </small>
                </span>
                {busy ? (
                  <span className="channel-identity-check">…</span>
                ) : current ? (
                  <span className="channel-identity-check">✓</span>
                ) : (
                  <span className="live-picker-go">Abrir</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="channel-identity-foot">
          Também podes colar o link direto da live (youtube.com/watch?v=…)
        </div>
      </div>
    </>
  )
}
