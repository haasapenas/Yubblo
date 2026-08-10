import type { MouseEvent, ReactElement, ReactNode } from 'react'
import type { ChannelTab } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

export interface ChannelTabsProps {
  tabs: ChannelTab[]
  activeVideoId: string | null
  onSelect(videoId: string): void
  onClose(videoId: string): void
  /** Botão + / Adicionar (modal) — sempre no fim da faixa de abas */
  addSlot?: ReactNode
}

export function ChannelTabs({
  tabs,
  activeVideoId,
  onSelect,
  onClose,
  addSlot
}: ChannelTabsProps): ReactElement | null {
  const { t } = useTranslation('channels', { i18n })
  if (!tabs.length && !addSlot) return null

  function close(event: MouseEvent, videoId: string): void {
    event.stopPropagation()
    event.preventDefault()
    onClose(videoId)
  }

  return (
    <div className="channel-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.videoId}
          type="button"
          role="tab"
          aria-selected={tab.videoId === activeVideoId}
          className={[
            'channel-tab',
            tab.videoId === activeVideoId ? 'active' : '',
            tab.status === 'live' ? 'live' : '',
            tab.status === 'connecting' ? 'connecting' : '',
            tab.status === 'ended' || tab.status === 'error' ? 'offline' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onSelect(tab.videoId)}
          title={
            tab.status === 'connecting'
              ? t('connecting', { channel: tab.channelName || tab.title })
              : tab.status === 'ended' || tab.status === 'error'
                ? t('offline', { channel: tab.channelName || tab.title })
                : tab.title
          }
        >
          <span className="channel-tab-dot" />
          <span className="channel-tab-name">
            {tab.channelHandle
              ? `@${tab.channelHandle.replace(/^@/, '')}`
              : tab.channelName || tab.title}
          </span>
          <span
            className="channel-tab-close"
            title={t('close')}
            onClick={(event) => close(event, tab.videoId)}
          >
            ×
          </span>
        </button>
      ))}
      {addSlot}
    </div>
  )
}
