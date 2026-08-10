import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'

export interface ChannelBarProps {
  busy: boolean
  /** Abre o canal; retorna true se fechou o modal (sucesso). */
  onOpen(value: string): boolean | Promise<boolean>
}

/**
 * Adicionar stream: botão compacto (+) + modal (sem barra de input sempre visível).
 */
export function ChannelBar(props: ChannelBarProps): ReactElement {
  const { busy, onOpen } = props
  const { t } = useTranslation('channels', { i18n })
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  function close(): void {
    if (busy) return
    setOpen(false)
    setValue('')
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || busy) return
    const ok = await onOpen(trimmed)
    if (ok) {
      setValue('')
      setOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="channel-tab channel-tab-add"
        disabled={busy}
        title={t('addStreamTitle')}
        aria-label={t('addStreamTitle')}
        onClick={() => {
          if (busy) return
          setOpen(true)
        }}
      >
        <span className="channel-tab-add-icon" aria-hidden>
          +
        </span>
        <span className="channel-tab-name">{t('add')}</span>
      </button>

      {open ? (
        <>
          <div
            className="account-menu-backdrop"
            style={{ zIndex: 60 }}
            onClick={close}
          />
          <div
            className="add-channel-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('addStreamTitle')}
          >
            <div className="add-channel-head">
              <div>
                <h2>{t('addStreamTitle')}</h2>
                <p>{t('addStreamHelp')}</p>
              </div>
              <button
                type="button"
                className="emote-picker-close"
                disabled={busy}
                onClick={close}
                aria-label={t('close')}
              >
                ×
              </button>
            </div>
            <form className="add-channel-form" onSubmit={(e) => void submit(e)}>
              <label className="add-channel-label" htmlFor="add-channel-input">
                {t('addStreamLabel')}
              </label>
              <input
                id="add-channel-input"
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={busy}
                spellCheck={false}
                autoComplete="off"
              />
              <div className="add-channel-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={close}
                >
                  {t('close')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !value.trim()}
                >
                  {busy ? t('opening') : t('add')}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </>
  )
}
