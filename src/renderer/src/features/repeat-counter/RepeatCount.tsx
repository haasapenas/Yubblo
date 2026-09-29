import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'
import './repeat-counter.css'

export function RepeatCount({ count }: { count: number }): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  return (
    <span className="msg-repeat-count" title={t('repeatCounter.title', { count })}>
      x{count}
    </span>
  )
}
