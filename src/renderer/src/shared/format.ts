import type { AppError } from '../../../shared/types'
import { i18n } from '../i18n/i18n-renderer'

export function parseIpcError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error)
  try {
    const parsed = JSON.parse(message) as AppError
    if (parsed?.message || parsed?.messageKey) {
      return { ...parsed, message: parsed.message || '' }
    }
  } catch {
    // Mensagem simples.
  }
  return { code: 'UNKNOWN', message: message || i18n.t('unknown', { ns: 'errors' }) }
}

export function formatTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp))
  } catch {
    return '--:--'
  }
}
