import type { ReactElement } from 'react'
import type { ChannelActivityTarget, ModMenuAction } from '../../../../shared/types'
import { modLabel } from './moderation-ui'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

export interface ModerationMenuState {
  messageId: string
  videoId: string
  actions: ModMenuAction[]
  durationMode: boolean
  loading: boolean
  channelActivityTarget?: ChannelActivityTarget
  monitoringTarget?: { channelId: string; name: string }
  x: number
  y: number
}

export interface ModerationMenuProps {
  menu: ModerationMenuState | null
  busy: boolean
  onClose(): void
  onBack(): void
  onRun(action: ModMenuAction): void
  onOpenChannelActivity?(target: ChannelActivityTarget): void
  monitoredUserIds?: ReadonlySet<string>
  onToggleMonitoring?(target: { channelId: string; name: string }): void
}

export function ModerationMenu({
  menu,
  busy,
  onClose,
  onBack,
  onRun,
  onOpenChannelActivity,
  monitoredUserIds = new Set(),
  onToggleMonitoring
}: ModerationMenuProps): ReactElement | null {
  const { t } = useTranslation('moderation', { i18n })
  if (!menu) return null
  return (
    <>
      <div className="mod-backdrop" onClick={() => { if (!busy) onClose() }} />
      <div className="mod-menu" style={{ left: menu.x, top: menu.y }} role="menu">
        <div className="mod-menu-title">
          {menu.durationMode ? t('timeoutDuration') : t('title')}
        </div>
        {menu.loading || busy ? (
          <div className="mod-menu-item muted">{t('loading')}</div>
        ) : menu.actions.map((action) => (
          <button
            key={`${action.iconType}-${action.label}`}
            type="button"
            className={`mod-menu-item kind-${action.kind}`}
            onClick={() => onRun(action)}
          >
            {modLabel(action)}
            {action.kind === 'timeout' && !menu.durationMode &&
              action.iconType === 'TIMEOUT_MENU' && (
                <span className="mod-chevron">›</span>
              )}
          </button>
        ))}
        {!menu.loading && !busy && !menu.durationMode && menu.channelActivityTarget && (
          <button type={'button'} className={'mod-menu-item'} onClick={() => onOpenChannelActivity?.(menu.channelActivityTarget!)}>
            {t('channelActivity', { defaultValue: 'Channel activity' })}
          </button>
        )}
        {!busy && !menu.durationMode && menu.monitoringTarget && (
          <button
            type="button"
            className="mod-menu-item"
            onClick={() => onToggleMonitoring?.(menu.monitoringTarget!)}
          >
            {monitoredUserIds.has(menu.monitoringTarget.channelId)
              ? t('stopMonitoring')
              : t('monitorUser')}
          </button>
        )}
        <button
          type="button"
          className="mod-menu-item cancel"
          disabled={busy}
          onClick={menu.durationMode ? onBack : onClose}
        >
          {menu.durationMode ? t('back') : t('cancel')}
        </button>
      </div>
    </>
  )
}
