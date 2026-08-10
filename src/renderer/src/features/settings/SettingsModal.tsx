import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLocale } from '../../../../shared/i18n/locale'
import type {
  ChatActionButton,
  ChatActionKind,
  HighlightRule
} from '../../../../shared/types'
import { TIMEOUT_DURATION_KEYS } from '../../../../shared/types'
import {
  HIGHLIGHT_PRESETS,
  hexToRgba,
  newLocalActionId,
  newLocalHighlightId
} from './highlights'

export interface SettingsModalProps {
  open: boolean
  locale: AppLocale
  highlights: HighlightRule[]
  actionButtons: ChatActionButton[]
  busy: boolean
  onClose(): void
  saveHighlights(next: HighlightRule[]): Promise<void>
  saveActionButtons(next: ChatActionButton[]): Promise<void>
  saveLocale(next: AppLocale): Promise<void>
}

export function SettingsModal({
  open,
  locale,
  highlights,
  actionButtons,
  busy,
  onClose,
  saveHighlights,
  saveActionButtons,
  saveLocale
}: SettingsModalProps): ReactElement | null {
  const { t } = useTranslation(['settings', 'common'])
  const [tab, setTab] = useState<'highlights' | 'actions'>('highlights')
  const [highlightPattern, setHighlightPattern] = useState('')
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_PRESETS[0]!)
  const [highlightCase, setHighlightCase] = useState(false)
  const [highlightWhole, setHighlightWhole] = useState(false)
  const [actionKind, setActionKind] = useState<ChatActionKind>('timeout')
  const [actionLabel, setActionLabel] = useState('10s')
  const [actionTimeout, setActionTimeout] = useState<string>('10s')
  const [actionCommand, setActionCommand] = useState('!cmd {username}')
  const [actionColor, setActionColor] = useState('')

  if (!open) return null

  async function addHighlight(): Promise<void> {
    const pattern = highlightPattern.trim()
    if (!pattern) return
    setHighlightPattern('')
    await saveHighlights([
      ...highlights,
      {
        id: newLocalHighlightId(),
        pattern,
        color: highlightColor,
        enabled: true,
        caseSensitive: highlightCase,
        wholeWord: highlightWhole
      }
    ])
  }

  async function updateHighlight(
    id: string,
    patch: Partial<HighlightRule>
  ): Promise<void> {
    await saveHighlights(
      highlights.map((rule) => rule.id === id ? { ...rule, ...patch } : rule)
    )
  }

  async function addAction(): Promise<void> {
    const label = actionLabel.trim() || (actionKind === 'timeout' ? actionTimeout : 'btn')
    const button: ChatActionButton = {
      id: newLocalActionId(),
      label: label.slice(0, 24),
      kind: actionKind,
      enabled: true
    }
    if (actionColor) button.color = actionColor
    if (actionKind === 'timeout') button.timeoutKey = actionTimeout
    if (actionKind === 'command') {
      const command = actionCommand.trim()
      if (!command) return
      button.command = command
    }
    await saveActionButtons([...actionButtons, button])
  }

  async function updateAction(
    id: string,
    patch: Partial<ChatActionButton>
  ): Promise<void> {
    await saveActionButtons(
      actionButtons.map((button) => button.id === id ? { ...button, ...patch } : button)
    )
  }

  return (
    <>
      <div
        className="account-menu-backdrop"
        style={{ zIndex: 70 }}
        onClick={() => { if (!busy) onClose() }}
      />
      <div className="settings-modal" role="dialog" aria-label="Configurações">
        <div className="settings-modal-head">
          <div>
            <h2>{t('settings:title')}</h2>
            <p>{t('settings:description')}</p>
          </div>
          <button type="button" className="emote-picker-close" disabled={busy} onClick={onClose}>×</button>
        </div>

        <div className="settings-tabs">
          <button
            type="button"
            className={`settings-tab${tab === 'highlights' ? ' active' : ''}`}
            onClick={() => setTab('highlights')}
          >Highlights</button>
          <button
            type="button"
            className={`settings-tab${tab === 'actions' ? ' active' : ''}`}
            onClick={() => setTab('actions')}
          >Botões de ação</button>
        </div>

        <section className='settings-section'>
          <h3>{t('settings:language.title')}</h3>
          <p className='settings-hint'>{t('settings:language.help')}</p>
          <select
            className='act-select'
            value={locale}
            disabled={busy}
            onChange={(event) => void saveLocale(event.target.value as AppLocale)}
          >
            <option value='en-US'>{t('common:language.english')}</option>
            <option value='pt-BR'>{t('common:language.portugueseBrazil')}</option>
          </select>
        </section>

        {tab === 'highlights' && (
          <section className="settings-section">
            <h3>Highlights</h3>
            <p className="settings-hint">
              Ordem = prioridade. A primeira regra encontrada define a cor em todas as abas.
            </p>
            <div className="hl-add">
              <input
                className="hl-pattern-input"
                value={highlightPattern}
                onChange={(event) => setHighlightPattern(event.target.value)}
                placeholder="Palavra ou frase…"
                spellCheck={false}
                disabled={busy}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void addHighlight()
                  }
                }}
              />
              <label className="hl-color-wrap" title="Cor">
                <input
                  type="color"
                  value={highlightColor.length === 7 ? highlightColor : '#f5a524'}
                  onChange={(event) => setHighlightColor(event.target.value)}
                  disabled={busy}
                />
              </label>
              <div className="hl-presets">
                {HIGHLIGHT_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`hl-swatch${highlightColor === color ? ' active' : ''}`}
                    style={{ background: color }}
                    title={color}
                    disabled={busy}
                    onClick={() => setHighlightColor(color)}
                  />
                ))}
              </div>
              <label className="hl-check">
                <input type="checkbox" checked={highlightCase} onChange={(event) => setHighlightCase(event.target.checked)} disabled={busy} /> Aa
              </label>
              <label className="hl-check" title="Só palavra inteira">
                <input type="checkbox" checked={highlightWhole} onChange={(event) => setHighlightWhole(event.target.checked)} disabled={busy} /> palavra
              </label>
              <button type="button" className="btn btn-primary" disabled={busy || !highlightPattern.trim()} onClick={() => void addHighlight()}>
                Adicionar
              </button>
            </div>

            {highlights.length === 0 ? (
              <div className="hl-empty">Nenhum highlight ainda.</div>
            ) : (
              <ul className="hl-list">
                {highlights.map((rule) => (
                  <li key={rule.id} className={`hl-row${!rule.enabled ? ' off' : ''}`}>
                    <label className="hl-enable" title="Ativo">
                      <input type="checkbox" checked={rule.enabled} disabled={busy} onChange={(event) => void updateHighlight(rule.id, { enabled: event.target.checked })} />
                    </label>
                    <span className="hl-row-preview" style={{ background: hexToRgba(rule.color, 0.22), boxShadow: `inset 3px 0 0 ${rule.color}` }}>
                      {rule.pattern}
                    </span>
                    <label className="hl-color-wrap sm">
                      <input type="color" value={rule.color.length === 7 ? rule.color : '#f5a524'} disabled={busy} onChange={(event) => void updateHighlight(rule.id, { color: event.target.value })} />
                    </label>
                    <label className="hl-check sm" title="Diferenciar maiúsculas">
                      <input type="checkbox" checked={!!rule.caseSensitive} disabled={busy} onChange={(event) => void updateHighlight(rule.id, { caseSensitive: event.target.checked })} /> Aa
                    </label>
                    <label className="hl-check sm" title="Palavra inteira">
                      <input type="checkbox" checked={!!rule.wholeWord} disabled={busy} onChange={(event) => void updateHighlight(rule.id, { wholeWord: event.target.checked })} /> pal.
                    </label>
                    <button type="button" className="hl-remove" title="Remover" disabled={busy} onClick={() => void saveHighlights(highlights.filter((item) => item.id !== rule.id))}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'actions' && (
          <section className="settings-section">
            <h3>Botões de ação</h3>
            <p className="settings-hint">
              Aparecem antes do nome somente quando você é moderador ou dono da transmissão.
              Em comandos, {'{username}'} vira @nome e {'{name}'} não adiciona @.
            </p>
            <div className="act-add">
              <select
                className="act-select"
                value={actionKind}
                disabled={busy}
                onChange={(event) => {
                  const kind = event.target.value as ChatActionKind
                  setActionKind(kind)
                  if (kind === 'timeout') setActionLabel(actionTimeout)
                  else if (kind === 'delete') setActionLabel('✕')
                  else if (kind === 'hide') setActionLabel('hide')
                  else if (kind === 'unhide') setActionLabel('show')
                  else setActionLabel('!')
                }}
              >
                <option value="timeout">Timeout</option>
                <option value="delete">Apagar</option>
                <option value="hide">Ocultar</option>
                <option value="unhide">Desocultar</option>
                <option value="command">Mensagem/comando</option>
              </select>
              <input className="hl-pattern-input act-label" value={actionLabel} onChange={(event) => setActionLabel(event.target.value)} placeholder="Rótulo" spellCheck={false} disabled={busy} maxLength={24} />
              {actionKind === 'timeout' && (
                <select className="act-select" value={actionTimeout} disabled={busy} onChange={(event) => { setActionTimeout(event.target.value); setActionLabel(event.target.value) }}>
                  {TIMEOUT_DURATION_KEYS.map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
              )}
              {actionKind === 'command' && (
                <input className="hl-pattern-input act-cmd" value={actionCommand} onChange={(event) => setActionCommand(event.target.value)} placeholder="!placar {username}" spellCheck={false} disabled={busy} />
              )}
              <label className="hl-color-wrap" title="Cor">
                <input type="color" value={actionColor.length === 7 ? actionColor : '#888888'} onChange={(event) => setActionColor(event.target.value)} disabled={busy} />
              </label>
              <button type="button" className="btn btn-primary" disabled={busy || (actionKind === 'command' && !actionCommand.trim())} onClick={() => void addAction()}>
                Adicionar
              </button>
            </div>

            {actionButtons.length === 0 ? (
              <div className="hl-empty">Nenhum botão configurado.</div>
            ) : (
              <ul className="hl-list">
                {actionButtons.map((button) => (
                  <li key={button.id} className={`hl-row${!button.enabled ? ' off' : ''}`}>
                    <label className="hl-enable" title="Ativo">
                      <input type="checkbox" checked={button.enabled} disabled={busy} onChange={(event) => void updateAction(button.id, { enabled: event.target.checked })} />
                    </label>
                    <span className="msg-action-btn act-preview" style={button.color ? { color: button.color, borderColor: button.color } : undefined}>{button.label}</span>
                    <span className="act-meta">
                      {button.kind === 'timeout' ? `timeout ${button.timeoutKey}` : button.kind === 'command' ? button.command : button.kind}
                    </span>
                    <label className="hl-color-wrap sm">
                      <input type="color" value={button.color?.length === 7 ? button.color : '#f5a524'} disabled={busy} onChange={(event) => void updateAction(button.id, { color: event.target.value })} />
                    </label>
                    <button type="button" className="hl-remove" title="Remover" disabled={busy} onClick={() => void saveActionButtons(actionButtons.filter((item) => item.id !== button.id))}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  )
}
