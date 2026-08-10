import { useEffect, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

interface DeleteStreamDialogProps {
  open: boolean
  streamTitle: string
  busy: boolean
  error: string | null
  onCancel(): void
  onConfirm(): void
}

export function deleteDialogKeyAction(key: string): 'cancel' | null {
  return key === 'Escape' ? 'cancel' : null
}

export function isDeleteDialogBackdropClick(
  target: unknown,
  currentTarget: unknown
): boolean {
  return target === currentTarget
}

export function DeleteStreamDialog({
  open,
  streamTitle,
  busy,
  error,
  onCancel,
  onConfirm
}: DeleteStreamDialogProps): ReactElement | null {
  const { t } = useTranslation('moderationLogs')

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (deleteDialogKeyAction(event.key) !== 'cancel' || busy) return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel, open])

  if (!open) return null

  return (
    <div
      className="ml-dialog-backdrop"
      onMouseDown={(event) => {
        if (!busy && isDeleteDialogBackdropClick(event.target, event.currentTarget)) {
          onCancel()
        }
      }}
    >
      <section
        className="ml-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ml-delete-dialog-title"
      >
        <h2 id="ml-delete-dialog-title">{t('deleteConfirm.title')}</h2>
        <div className="ml-dialog-stream" title={streamTitle}>{streamTitle}</div>
        <p>{t('deleteConfirm.warning')}</p>
        {error ? <div className="ml-dialog-error">{error}</div> : null}
        <div className="ml-dialog-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            {t('deleteConfirm.cancel')}
          </button>
          <button type="button" className="btn btn-danger-solid" disabled={busy} onClick={onConfirm}>
            {busy ? t('deleteConfirm.deleting') : t('deleteConfirm.confirm')}
          </button>
        </div>
      </section>
    </div>
  )
}
