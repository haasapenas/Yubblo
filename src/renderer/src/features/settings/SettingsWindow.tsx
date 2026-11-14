import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLocale } from '../../../../shared/i18n/locale'
import type {
  AppSettings,
  ChatActionButton,
  ChatActionKind,
  HighlightPreferences,
  MonitoringSettings
} from '../../../../shared/types'
import { TIMEOUT_DURATION_KEYS } from '../../../../shared/types'
import { newLocalActionId } from './highlights'
import { HighlightMessagesSection } from './highlights/HighlightMessagesSection'
import type { HighlightDraft } from './highlights/use-highlight-autosave'
import { ChatSettingsSection } from './ChatSettingsSection'
import { LanguageSettingsSection } from './LanguageSettingsSection'
import { UpdateSettingsSection } from './UpdateSettingsSection'
import { MonitoringSettingsSection } from './MonitoringSettingsSection'
import { ChatLogsSettingsSection } from './ChatLogsSettingsSection'
import { actionButtonFace } from '../moderation/DeleteActionIcon'
import { useActionButtonReorder } from './use-action-button-reorder'
import { ActionButtonEditDialog } from './ActionButtonEditDialog'
import { Button } from './ui/Button'
import { DeleteButton } from './ui/DeleteButton'
import { EditButton } from './ui/EditButton'
import { PillToggle } from './ui/PillToggle'
import { ThreadSettingsRow } from '../threads/ThreadSettingsRow'
import { RepeatCounterSettingsRow } from '../repeat-counter/RepeatCounterSettingsRow'
import { AlwaysOnTopSettingsRow } from '../always-on-top/AlwaysOnTopSettingsRow'

type SettingsTab = 'general' | 'highlights' | 'monitoring' | 'logs' | 'actions'

const NAV: Array<{
  id: SettingsTab
  labelKey: 'settings:nav.general' | 'settings:nav.highlights' | 'settings:nav.monitoring' | 'settings:nav.logs' | 'settings:nav.actions'
}> = [
  { id: 'general', labelKey: 'settings:nav.general' },
  { id: 'highlights', labelKey: 'settings:nav.highlights' },
  { id: 'monitoring', labelKey: 'settings:nav.monitoring' },
  { id: 'logs', labelKey: 'settings:nav.logs' },
  { id: 'actions', labelKey: 'settings:nav.actions' }
]

/**
 * Settings em janela própria — save imediato (sem draft Save/Cancel).
 */
export function SettingsWindow(): ReactElement {
  const { t, i18n } = useTranslation(['settings', 'common', 'moderation'])
  const [tab, setTab] = useState<SettingsTab>('general')
  const [locale, setLocale] = useState<AppLocale>('en-US')
  const [chatFontSize, setChatFontSize] = useState(13)
  const [chatMessagePadding, setChatMessagePadding] = useState(2)
  const [separateMessages, setSeparateMessages] = useState(false)
  const [pauseChatOnHover, setPauseChatOnHover] = useState(false)
  const [showFocusModeShortcut, setShowFocusModeShortcut] = useState(false)
  const [colorizeUsernames, setColorizeUsernames] = useState(false)
  const [highlights, setHighlights] = useState<AppSettings['highlights']>([])
  const [highlightPreferences, setHighlightPreferences] = useState<HighlightPreferences>({
    selfEnabled: true,
    selfColor: '#f5a524',
    selfPlaySound: false,
    playSoundWhileFocused: false,
    defaultColor: '#f5a52480'
  })
  const [monitoring, setMonitoring] = useState<MonitoringSettings>({
    users: [],
    color: '#58249ccc'
  })
  const [chatLogs, setChatLogs] = useState<AppSettings['chatLogs']>({
    enabled: false,
    onlyListedChannels: false,
    channels: []
  })
  const [chatLogsPath, setChatLogsPath] = useState('')
  const [actionButtons, setActionButtons] = useState<ChatActionButton[]>([])
  const [busy, setBusy] = useState(false)
  const [actionKind, setActionKind] = useState<ChatActionKind>('timeout')
  const [actionLabel, setActionLabel] = useState('10s')
  const [actionTimeout, setActionTimeout] = useState('10s')
  const [actionCommand, setActionCommand] = useState('!cmd {username}')
  const [actionColor, setActionColor] = useState('')
  const [editingAction, setEditingAction] = useState<ChatActionButton | null>(null)

  function applySettings(s: AppSettings): void {
    setLocale(s.locale)
    setChatFontSize(s.chatFontSize)
    setChatMessagePadding(s.chatMessagePadding)
    setSeparateMessages(s.separateMessages === true)
    setPauseChatOnHover(s.pauseChatOnHover === true)
    setShowFocusModeShortcut(s.showFocusModeShortcut === true)
    setColorizeUsernames(s.colorizeUsernames === true)
    void i18n.changeLanguage(s.locale)
    setHighlights(s.highlights || [])
    setHighlightPreferences(s.highlightPreferences)
    setMonitoring(s.monitoring)
    setChatLogs(s.chatLogs)
    setActionButtons(s.actionButtons || [])
  }

  useEffect(() => {
    void window.settingsPopup.get().then(applySettings).catch(console.error)
    void window.settingsPopup.chatLogsPath().then(setChatLogsPath).catch(console.error)
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

  async function saveSeparateMessages(next: boolean): Promise<void> {
    setBusy(true)
    try {
      applySettings(await window.settingsPopup.setSeparateMessages(next))
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

  async function saveColorizeUsernames(next: boolean): Promise<void> {
    setBusy(true)
    try {
      applySettings(await window.settingsPopup.setColorizeUsernames(next))
    } finally {
      setBusy(false)
    }
  }

  async function saveChatFontSize(next: number): Promise<void> {
    setBusy(true)
    try {
      applySettings(await window.settingsPopup.setChatFontSize(next))
    } finally {
      setBusy(false)
    }
  }

  async function saveChatMessagePadding(next: number): Promise<void> {
    setBusy(true)
    try {
      applySettings(await window.settingsPopup.setChatMessagePadding(next))
    } finally {
      setBusy(false)
    }
  }
  async function saveMonitoring(next: MonitoringSettings): Promise<void> {
    setBusy(true)
    try {
      applySettings(await window.settingsPopup.setMonitoring(next))
    } finally {
      setBusy(false)
    }
  }
  async function saveChatLogs(next: AppSettings['chatLogs']): Promise<void> {
    setBusy(true)
    try {
      applySettings(await window.settingsPopup.setChatLogs(next))
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
  const reorder = useActionButtonReorder(actionButtons, {
    disabled: busy,
    onCommit: (next) => { void saveActionButtons(next) }
  })
  const title =
    tab === 'general'
      ? t('settings:nav.general')
      : tab === 'highlights'
        ? t('settings:nav.highlights')
        : tab === 'monitoring'
          ? t('settings:nav.monitoring')
          : tab === 'logs'
            ? t('settings:nav.logs')
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
                chatFontSize={chatFontSize}
                chatMessagePadding={chatMessagePadding}
                separateMessages={separateMessages}
                pauseOnHover={pauseChatOnHover}
                showFocusModeShortcut={showFocusModeShortcut}
                colorizeUsernames={colorizeUsernames}
                busy={busy}
                onChatFontSizeChange={(fontSize) => void saveChatFontSize(fontSize)}
                onChatMessagePaddingChange={(padding) => void saveChatMessagePadding(padding)}
                onSeparateMessagesChange={(enabled) => void saveSeparateMessages(enabled)}
                onPauseOnHoverChange={(enabled) => void savePauseChatOnHover(enabled)}
                onShowFocusModeShortcutChange={(enabled) =>
                  void saveShowFocusModeShortcut(enabled)
                }
                onColorizeUsernamesChange={(enabled) =>
                  void saveColorizeUsernames(enabled)
                }
              />
              <ThreadSettingsRow />
              <RepeatCounterSettingsRow />
              <AlwaysOnTopSettingsRow />
              <div className="settings-group-label">
                {t('settings:groups.moderation')}
              </div>
              <div className="settings-row last">
                <div className="sr-text">
                  <div className="sr-title">{t('settings:moderationLogs.title')}</div>
                </div>
                <div className="sr-control">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void window.settingsPopup.openModerationLogs()
                    }}
                  >
                    {t('settings:moderationLogs.open')}
                  </Button>
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

          {tab === 'monitoring' && (
            <MonitoringSettingsSection
              monitoring={monitoring}
              busy={busy}
              onChange={(next) => { void saveMonitoring(next) }}
            />
          )}

          {tab === 'logs' && (
            <ChatLogsSettingsSection
              chatLogs={chatLogs}
              path={chatLogsPath}
              busy={busy}
              onChange={(next) => { void saveChatLogs(next) }}
              onOpenFolder={() => { void window.settingsPopup.openChatLogsFolder() }}
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
                    else if (kind === 'monitor') setActionLabel('monitor')
                    else setActionLabel('!')
                  }}
                >
                  <option value="monitor">{t('moderation:monitorUser')}</option>
                  <option value="timeout">Timeout</option>
                  <option value="delete">Delete</option>
                  <option value="hide">Hide</option>
                  <option value="unhide">Unhide</option>
                  <option value="command">Command</option>
                </select>
                {actionKind === 'delete' || actionKind === 'hide' || actionKind === 'monitor' ? (
                  <span className="msg-action-btn act-preview act-icon-fixed" aria-hidden="true">
                    {actionButtonFace(actionKind, actionLabel)}
                  </span>
                ) : (
                  <input
                    className="hl-pattern-input act-label"
                    value={actionLabel}
                    onChange={(e) => setActionLabel(e.target.value)}
                    placeholder="Label"
                    spellCheck={false}
                    disabled={busy}
                    maxLength={24}
                  />
                )}
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
                <Button
                  variant="primary"
                  disabled={
                    busy ||
                    (actionKind === 'command' && !actionCommand.trim())
                  }
                  onClick={() => void addAction()}
                >
                  + {t('common:actions.add')}
                </Button>
              </div>

              {actionButtons.length === 0 ? (
                <div className="hl-empty">{t('settings:noActions')}</div>
              ) : (
                <ul
                  className={`hl-list${reorder.dragId ? ' is-reordering' : ''}`}
                  onPointerMove={reorder.onPointerMove}
                  onPointerUp={reorder.onPointerUp}
                  onPointerCancel={reorder.onPointerCancel}
                >
                  {reorder.displayed.map((button) => (
                    <li
                      key={button.id}
                      data-action-id={button.id}
                      className={`hl-row${!button.enabled ? ' off' : ''}${
                        reorder.dragId === button.id ? ' dragging' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="hl-grip"
                        title={t('common:actions.reorder')}
                        aria-label={t('common:actions.reorder')}
                        disabled={busy || actionButtons.length < 2}
                        onPointerDown={reorder.onGripPointerDown}
                        onPointerMove={reorder.onPointerMove}
                        onPointerUp={reorder.onPointerUp}
                        onPointerCancel={reorder.onPointerCancel}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
                          <path d="M108,60A16,16,0,1,1,92,44,16,16,0,0,1,108,60Zm56,16a16,16,0,1,0-16-16A16,16,0,0,0,164,76ZM92,112a16,16,0,1,0,16,16A16,16,0,0,0,92,112Zm72,0a16,16,0,1,0,16,16A16,16,0,0,0,164,112ZM92,180a16,16,0,1,0,16,16A16,16,0,0,0,92,180Zm72,0a16,16,0,1,0,16,16A16,16,0,0,0,164,180Z" />
                        </svg>
                      </button>
                      <PillToggle
                        aria-label="Enabled"
                        checked={button.enabled}
                        onChange={(enabled) =>
                          void updateAction(button.id, { enabled })
                        }
                      />
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
                        {actionButtonFace(button.kind, button.label)}
                      </span>
                      <span className="act-meta">
                        {button.kind === 'timeout'
                          ? `timeout ${button.timeoutKey}`
                          : button.kind === 'command'
                            ? button.command
                            : button.kind}
                      </span>
                      <span className="hl-row-actions-cluster">
                        <EditButton
                          title={t('common:actions.edit')}
                          aria-label={t('common:actions.edit')}
                          disabled={busy}
                          onClick={() => setEditingAction(button)}
                        >
                          {t('common:actions.edit')}
                        </EditButton>
                        <DeleteButton
                          title={t('common:actions.remove')}
                          aria-label={t('common:actions.remove')}
                          disabled={busy}
                          onClick={() => {
                            if (editingAction?.id === button.id) setEditingAction(null)
                            void saveActionButtons(
                              actionButtons.filter(
                                (item) => item.id !== button.id
                              )
                            )
                          }}
                        >
                          {t('common:actions.delete')}
                        </DeleteButton>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
      {editingAction ? (
        <ActionButtonEditDialog
          key={editingAction.id}
          button={editingAction}
          busy={busy}
          onCancel={() => setEditingAction(null)}
          onSave={(next) => {
            setEditingAction(null)
            void saveActionButtons(
              actionButtons.map((item) => (item.id === next.id ? next : item))
            )
          }}
        />
      ) : null}
    </div>
  )
}
