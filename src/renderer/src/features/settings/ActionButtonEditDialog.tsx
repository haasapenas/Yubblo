import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatActionButton, ChatActionKind } from '../../../../shared/types'
import { TIMEOUT_DURATION_KEYS } from '../../../../shared/types'
import { actionButtonFace } from '../moderation/DeleteActionIcon'
import { Button } from './ui/Button'

function applyKindDefaults(kind: ChatActionKind, timeout: string): string {
  if (kind === 'timeout') return timeout
  if (kind === 'delete') return '✕'
  if (kind === 'hide') return 'hide'
  if (kind === 'unhide') return 'show'
  return '!'
}

export function ActionButtonEditDialog({
  button,
  busy = false,
  onCancel,
  onSave
}: {
  button: ChatActionButton
  busy?: boolean
  onCancel(): void
  onSave(next: ChatActionButton): void
}): ReactElement {
  const { t } = useTranslation(['settings', 'common'])
  const [kind, setKind] = useState<ChatActionKind>(button.kind)
  const [label, setLabel] = useState(button.label)
  const [timeout, setTimeoutKey] = useState(button.timeoutKey || '10s')
  const [command, setCommand] = useState(button.command || '!cmd {username}')
  const [color, setColor] = useState(button.color || '')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || busy) return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  function save(): void {
    const nextLabel = label.trim() || (kind === 'timeout' ? timeout : 'btn')
    const next: ChatActionButton = {
      id: button.id,
      label: nextLabel.slice(0, 24),
      kind,
      enabled: button.enabled
    }
    if (color) next.color = color
    if (kind === 'timeout') next.timeoutKey = timeout
    if (kind === 'command') {
      const trimmed = command.trim()
      if (!trimmed) return
      next.command = trimmed
    }
    onSave(next)
  }

  return (
    <div
      className="act-edit-overlay"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel()
      }}
    >
      <section className="act-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="act-edit-title">
        <header className="act-edit-head">
          <strong id="act-edit-title">{t('settings:actionEdit.title')}</strong>
          <button type="button" className="act-edit-close" aria-label={t('common:actions.close')} onClick={onCancel}>×</button>
        </header>
        <div className="act-edit-body">
          <select
            className="act-select"
            value={kind}
            disabled={busy}
            aria-label={t('settings:actionEdit.kind')}
            onChange={(event) => {
              const next = event.target.value as ChatActionKind
              setKind(next)
              setLabel(applyKindDefaults(next, timeout))
            }}
          >
            <option value="timeout">Timeout</option>
            <option value="delete">Delete</option>
            <option value="hide">Hide</option>
            <option value="unhide">Unhide</option>
            <option value="command">Command</option>
          </select>
          {kind === 'delete' || kind === 'hide' ? (
            <span className="msg-action-btn act-preview act-icon-fixed" aria-hidden="true">
              {actionButtonFace(kind, label)}
            </span>
          ) : (
            <input
              className="hl-pattern-input act-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Label"
              spellCheck={false}
              disabled={busy}
              maxLength={24}
            />
          )}
          {kind === 'timeout' ? (
            <select
              className="act-select"
              value={timeout}
              disabled={busy}
              onChange={(event) => {
                setTimeoutKey(event.target.value)
                setLabel(event.target.value)
              }}
            >
              {TIMEOUT_DURATION_KEYS.map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          ) : null}
          {kind === 'command' ? (
            <input
              className="hl-pattern-input act-cmd"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="!cmd {username}"
              spellCheck={false}
              disabled={busy}
            />
          ) : null}
          <label className="hl-color-wrap" title="Color">
            <input
              type="color"
              value={color.length === 7 ? color : '#888888'}
              onChange={(event) => setColor(event.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <footer className="act-edit-actions">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            data-testid="action-edit-save"
            disabled={busy || (kind === 'command' && !command.trim())}
            onClick={save}
          >
            {t('common:actions.save')}
          </Button>
        </footer>
      </section>
    </div>
  )
}
