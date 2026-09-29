import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppSettings } from '../../../../shared/types'
import { i18n } from '../../i18n/i18n-renderer'
import './always-on-top.css'

export function AlwaysOnTopButton(): ReactElement | null {
  const { t } = useTranslation('common', { i18n })
  const yubblo = typeof window !== 'undefined' ? window.yubblo : undefined
  const [visible, setVisible] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!yubblo) return
    const apply = (settings: AppSettings): void => {
      setVisible(settings.alwaysOnTopButton === true)
      setPinned(settings.alwaysOnTopButton === true && settings.alwaysOnTop === true)
    }
    void yubblo.settings.get().then(apply).catch(() => undefined)
    return yubblo.settings.onChanged(apply)
  }, [yubblo])

  if (!yubblo || !visible) return null

  const label = pinned ? t('alwaysOnTop.disable') : t('alwaysOnTop.enable')

  return (
    <button
      type="button"
      className={`window-ctrl window-ctrl-pin${pinned ? ' is-pinned' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={pinned}
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void yubblo.window.setAlwaysOnTop(!pinned)
          .then(setPinned)
          .catch(() => undefined)
          .finally(() => setBusy(false))
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4 1-3z"
          fill={pinned ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
