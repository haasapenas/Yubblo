import {
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import type { ChannelTab } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'
import { moveTabKey, tabIndexAtPoint } from './channel-tab-order'

export interface ChannelTabsProps {
  tabs: ChannelTab[]
  activeVideoId: string | null
  onSelect(videoId: string): void
  onClose(videoId: string): void
  onReorder?(orderedTabKeys: string[]): void
  /** Botão + / Adicionar (modal) — sempre no fim da faixa de abas */
  addSlot?: ReactNode
}

function tabKeyOf(tab: ChannelTab): string {
  return tab.tabKey || tab.videoId
}

const DRAG_THRESHOLD = 5

export function ChannelTabs({
  tabs,
  activeVideoId,
  onSelect,
  onClose,
  onReorder,
  addSlot
}: ChannelTabsProps): ReactElement | null {
  const { t } = useTranslation('channels', { i18n })
  const listRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    key: string
    videoId: string
    startX: number
    startY: number
    moved: boolean
    origin: string[]
  } | null>(null)
  const [previewKeys, setPreviewKeys] = useState<string[] | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)

  const visibleTabs = useMemo(() => {
    if (!previewKeys) return tabs
    const byKey = new Map(tabs.map((tab) => [tabKeyOf(tab), tab]))
    return previewKeys
      .map((key) => byKey.get(key))
      .filter((tab): tab is ChannelTab => !!tab)
  }, [previewKeys, tabs])

  if (!tabs.length && !addSlot) return null

  function close(event: MouseEvent, videoId: string): void {
    event.stopPropagation()
    event.preventDefault()
    onClose(videoId)
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>, tab: ChannelTab): void {
    if (!onReorder || event.button !== 0) return
    const target = event.target
    if (target instanceof Element && target.closest('.channel-tab-close')) return
    drag.current = {
      key: tabKeyOf(tab),
      videoId: tab.videoId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      origin: tabs.map(tabKeyOf)
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>): void {
    const current = drag.current
    if (!current || !onReorder || !listRef.current) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!current.moved) {
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
      current.moved = true
      setDraggingKey(current.key)
      setPreviewKeys(current.origin)
    }
    const index = tabIndexAtPoint(listRef.current, event.clientX, event.clientY)
    if (index < 0) return
    setPreviewKeys((keys) => moveTabKey(keys || current.origin, current.key, index))
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>): void {
    const current = drag.current
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const next = previewKeys
    setPreviewKeys(null)
    setDraggingKey(null)
    if (!current) return
    if (!current.moved) {
      onSelect(current.videoId)
      return
    }
    if (
      onReorder &&
      next &&
      next.join('\0') !== current.origin.join('\0')
    ) {
      onReorder(next)
    }
  }

  return (
    <div
      ref={listRef}
      className={['channel-tabs', draggingKey ? 'is-reordering' : '']
        .filter(Boolean)
        .join(' ')}
      role="tablist"
    >
      {visibleTabs.map((tab) => {
        const key = tabKeyOf(tab)
        const statusTitle =
          tab.status === 'connecting'
            ? t('connecting', { channel: tab.channelName || tab.title })
            : tab.status === 'ended' || tab.status === 'error'
              ? t('offline', { channel: tab.channelName || tab.title })
              : tab.title
        return (
        <button
          key={tab.videoId}
          type="button"
          role="tab"
          data-tab-key={key}
          aria-selected={tab.videoId === activeVideoId}
          className={[
            'channel-tab',
            onReorder ? 'reorderable' : '',
            draggingKey === key ? 'is-dragging' : '',
            tab.videoId === activeVideoId ? 'active' : '',
            tab.status === 'live' ? 'live' : '',
            tab.status === 'connecting' ? 'connecting' : '',
            tab.status === 'ended' || tab.status === 'error' ? 'offline' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          onPointerDown={(event) => beginDrag(event, tab)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title={onReorder ? `${statusTitle} · ${t('reorder')}` : statusTitle}
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
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => close(event, tab.videoId)}
          >
            ×
          </span>
        </button>
        )
      })}
      {addSlot}
    </div>
  )
}
