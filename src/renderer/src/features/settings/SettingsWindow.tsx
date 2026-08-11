import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLocale } from '../../../../shared/i18n/locale'
import type {
  AppSettings,
  ChatActionButton,
  ChatActionKind,
  HighlightPreferences
} from '../../../../shared/types'
import { TIMEOUT_DURATION_KEYS } from '../../../../shared/types'
import { newLocalActionId } from './highlights'
import { HighlightMessagesSection } from './highlights/HighlightMessagesSection'
import type { HighlightDraft } from './highlights/use-highlight-autosave'
import { ChatSettingsSection } from './ChatSettingsSection'
import { LanguageSettingsSection } from './LanguageSettingsSection'
import { UpdateSettingsSection } from './UpdateSettingsSection'

type SettingsTab = 'general' | 'highlights' | 'actions'

const NAV: Array<{
  id: SettingsTab
  labelKey: 'settings:nav.general' | 'settings:nav.highlights' | 'settings:nav.actions'
}> = [
  { id: 'general', labelKey: 'settings:nav.general' },
  { id: 'highlights', labelKey: 'settings:nav.highlights' },
  { id: 'actions', labelKey: 'settings:nav.actions' }
]

/**
 * Settings em janela própria — save imediato (sem draft Save/Cancel).
 */
export function SettingsWindow(): ReactElement {
  const { t, i18n } = useTranslation(['settings', 'common'])
  const [tab, setTab] = useState<SettingsTab>('general')
  const [locale, setLocale] = useState<AppLocale>('en-US')
  const [pauseChatOnHover, setPauseChatOnHover] = useState(false)
  const [showFocusModeShortcut, setShowFocusModeShortcut] = useState(false)
  const [highlights, setHighlights] = useState<AppSettings['highlights']>([])
  const [highlightPreferences, setHighlightPreferences] = useState<HighlightPreferences>({
    selfEnabled: true,
    selfColor: '#f5a524',
    selfPlaySound: false,
    playSoundWhileFocused: false
  })
  const [actionButtons, setActionButtons] = useState<ChatActionButton[]>([])
  const [busy, setBusy] = useState(false)
  const [actionKind, setActionKind] = useState<ChatActionKind>('timeout')
  const [actionLabel, setActionLabel] = useState('10s')
  const [actionTimeout, setActionTimeout] = useState('10s')
  const [actionCommand, setActionCommand] = useState('!cmd {username}')
  const [actionColor, setActionColor] = useState('')

  function applySettings(s: AppSettings): void {
    setLocale(s.locale)
    setPauseChatOnHover(s.pauseChatOnHover === true)
    setShowFocusModeShortcut(s.showFocusModeShortcut === true)
    void i18n.changeLanguage(s.locale)
    setHighlights(s.highlights || [])
    setHighlightPreferences(s.highlightPreferences)
    setActionButtons(s.actionButtons || [])
  }

  useEffect(() => {
    void window.settingsPopup.get().then(applySettings).catch(console.error)
    return window.settingsPopup.onChanged(applySettings)
  }, [])

  async function saveLocale(next: AppLocale): Promise<void> {
    setBusy(true)
    try {
      applySettings(await window.settingsPopup.setLocale(next))
    } finally {
      setBusy(false)
    }
  }

  async function savePauseChatOnHover(next: boolean): Promise<void> {
    setBusy(true)
    try {
      applySettings(await window.settingsPopup.setPauseChatOnHover(next))
    } finally {
      setBusy(false)
    }
  }

  async function saveShowFocusModeShortcut(next: boolean): Promise<void> {
    setBusy(true)
    try {
      applySettings(await window.settingsPopup.setShowFocusModeShortcut(next))
    } finally {
      setBusy(false)
    }
  }

  async function saveHighlightDraft(draft: HighlightDraft): Promise<HighlightDraft> {
    setBusy(true)
    try {
      await window.settingsPopup.setHighlights(draft.highlights)
      const saved = await window.settingsPopup.setHighlightPreferences(
        draft.highlightPreferences
      )
      applySettings(saved)
      return {
        highlights: saved.highlights,
        highlightPreferences: saved.highlightPreferences
      }
    } finally {
      setBusy(false)
    }
  }

  async function saveActionButtons(next: ChatActionButton[]): Promise<void> {
    setBusy(true)
    try {
      applySettings(await window.settingsPopup.setActionButtons(next))
    } finally {
      setBusy(false)
    }
  }
  async function addAction(): Promise<void> {
    const label =
      actionLabel.trim() || (actionKind === 'timeout' ? actionTimeout : 'btn')
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
      actionButtons.map((button) =>
        button.id === id ? { ...button, ...patch } : button
      )
    )
  }
  const title =
    tab === 'general'
      ? t('settings:nav.general')
      : tab === 'highlights'
        ? t('settings:nav.highlights')
        : t('settings:nav.actions')

  return (
    <div className="settings-window">
      <div className="settings-window-head">
        {t('settings:title')}
        <span>›</span>
        {title}
      </div>
      <div className="settings-window-body">
        <nav className="settings-sidebar" aria-label="Settings sections">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav-btn${tab === item.id ? ' active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>
        <div className={`settings-content${tab === 'highlights' ? ' highlights' : ''}` }>
          {tab === 'general' && (
            <>
              <div className="settings-group-label">
                {t('settings:groups.application')}
              </div>
              <LanguageSettingsSection
                locale={locale}
                busy={busy}
                onChange={(next) => void saveLocale(next)}
              />
              <UpdateSettingsSection />
              <div className="settings-group-label">{t('settings:chat.title')}</div>
              <ChatSettingsSection
                pauseOnHover={pauseChatOnHover}
                showFocusModeShortcut={showFocusModeShortcut}
                busy={busy}
                onPauseOnHoverChange={(enabled) => void savePauseChatOnHover(enabled)}
                onShowFocusModeShortcutChange={(enabled) =>
                  void saveShowFocusModeShortcut(enabled)
                }
              />
              <div className="settings-group-label">
                {t('settings:groups.moderation')}
              </div>
              <div className="settings-row last">
                <div className="sr-text">
                  <div className="sr-title">{t('settings:moderationLogs.title')}</div>
                  <div className="sr-desc">{t('settings:moderationLogs.help')}</div>
                </div>
                <div className="sr-control">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      void window.settingsPopup.openModerationLogs()
                    }}
                  >
                    {t('settings:moderationLogs.open')}
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'highlights' && (
            <HighlightMessagesSection
              initial={{ highlights, highlightPreferences }}
              onSave={saveHighlightDraft}
            />
          )}

          {tab === 'actions' && (
            <section className="settings-section">
              <h3>{t('settings:nav.actions')}</h3>
              <p className="settings-hint">{t('settings:actionsHelp')}</p>
              <div className="act-add">
                <select
                  className="act-select"
                  value={actionKind}
                  disabled={busy}
                  onChange={(e) => {
                    const kind = e.target.value as ChatActionKind
                    setActionKind(kind)
                    if (kind === 'timeout') setActionLabel(actionTimeout)
                    else if (kind === 'delete') setActionLabel('✕')
                    else if (kind === 'hide') setActionLabel('hide')
                    else if (kind === 'unhide') setActionLabel('show')
                    else setActionLabel('!')
                  }}
                >
                  <option value="timeout">Timeout</option>
                  <option value="delete">Delete</option>
                  <option value="hide">Hide</option>
                  <option value="unhide">Unhide</option>
                  <option value="command">Command</option>
                </select>
                <input
                  className="hl-pattern-input act-label"
                  value={actionLabel}
                  onChange={(e) => setActionLabel(e.target.value)}
                  placeholder="Label"
                  spellCheck={false}
                  disabled={busy}
                  maxLength={24}
                />
                {actionKind === 'timeout' && (
                  <select
                    className="act-select"
                    value={actionTimeout}
                    disabled={busy}
                    onChange={(e) => {
                      setActionTimeout(e.target.value)
                      setActionLabel(e.target.value)
                    }}
                  >
                    {TIMEOUT_DURATION_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                )}
                {actionKind === 'command' && (
                  <input
                    className="hl-pattern-input act-cmd"
                    value={actionCommand}
                    onChange={(e) => setActionCommand(e.target.value)}
                    placeholder="!cmd {username}"
                    spellCheck={false}
                    disabled={busy}
                  />
                )}
                <label className="hl-color-wrap" title="Color">
                  <input
                    type="color"
                    value={
                      actionColor.length === 7 ? actionColor : '#888888'
                    }
                    onChange={(e) => setActionColor(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    busy ||
                    (actionKind === 'command' && !actionCommand.trim())
                  }
                  onClick={() => void addAction()}
                >
                  + {t('common:actions.add')}
                </button>
              </div>

              {actionButtons.length === 0 ? (
                <div className="hl-empty">{t('settings:noActions')}</div>
              ) : (
                <ul className="hl-list">
                  {actionButtons.map((button) => (
                    <li
                      key={button.id}
                      className={`hl-row${!button.enabled ? ' off' : ''}`}
                    >
                      <label className="hl-enable" title="Enabled">
                        <input
                          type="checkbox"
                          checked={button.enabled}
                          disabled={busy}
                          onChange={(e) =>
                            void updateAction(button.id, {
                              enabled: e.target.checked
                            })
                          }
                        />
                      </label>
                      <span
                        className="msg-action-btn act-preview"
                        style={
                          button.color
                            ? {
                                color: button.color,
                                borderColor: button.color
                              }
                            : undefined
                        }
                      >
                        {button.label}
                      </span>
                      <span className="act-meta">
                        {button.kind === 'timeout'
                          ? `timeout ${button.timeoutKey}`
                          : button.kind === 'command'
                            ? button.command
                            : button.kind}
                      </span>
                      <button
                        type="button"
                        className="hl-remove"
                        title={t('common:actions.remove')}
                        disabled={busy}
                        onClick={() =>
                          void saveActionButtons(
                            actionButtons.filter(
                              (item) => item.id !== button.id
                            )
                          )
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
