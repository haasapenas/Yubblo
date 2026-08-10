import type { ChatMessage } from '../../../../shared/types'
import { i18n } from '../../i18n/i18n-renderer'

export function formatChatNotice(message: ChatMessage): string {
  const notice = message.systemNotice
  if (!notice || notice.kind !== 'slow-mode') return message.text

  if (notice.enabled === false) {
    return i18n.t('notices.slowModeDisabled', { ns: 'chat' })
  }

  if (notice.intervalSeconds && notice.intervalSeconds > 0) {
    return i18n.t('notices.slowModeInterval', {
      ns: 'chat',
      count: notice.intervalSeconds
    })
  }

  return i18n.t('notices.slowModeEnabled', { ns: 'chat' })
}
