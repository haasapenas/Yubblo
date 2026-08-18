import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

interface MemberBadgeProps {
  url?: string
  label?: string
}

export function MemberBadge({ url, label }: MemberBadgeProps): ReactElement {
  const { t } = useTranslation('chat', { i18n })
  const [imageFailed, setImageFailed] = useState(false)
  const fallback = t('message.memberBadge')

  useEffect(() => setImageFailed(false), [url])

  if (!url || imageFailed) {
    return <span className="badge member">{fallback}</span>
  }

  return (
    <img
      className="member-badge-image"
      src={url}
      alt={label || fallback}
      title={label || fallback}
      onError={() => setImageFailed(true)}
    />
  )
}
