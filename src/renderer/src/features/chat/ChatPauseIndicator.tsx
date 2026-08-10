import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

export function ChatPauseIndicator({
  visible
}: {
  visible: boolean
}): ReactElement | null {
  const { t } = useTranslation('chat', { i18n })
  if (!visible) return null

  return (
    <div className="chat-pause-indicator" role="status">
      <span aria-hidden>Ⅱ</span>
      {t('scrollPaused')}
    </div>
  )
}
