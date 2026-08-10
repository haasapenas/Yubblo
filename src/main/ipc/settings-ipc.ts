import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type { AppSettings, ChatActionButton, HighlightPreferences, HighlightRule } from '../../shared/contracts/settings'
import { normalizeAppLocale } from '../../shared/i18n/locale'
import { changeMainLocale } from '../i18n/i18n-main'
import {
  createActionId,
  createHighlightId,
  HIGHLIGHT_PRESET_COLORS,
  loadSettings,
  setActionButtons,
  setHighlights,
  setHighlightPreferences,
  setLocale,
  setPauseChatOnHover,
  setShowFocusModeShortcut
} from '../settings-store'

function broadcastSettings(settings: AppSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.settings.changed, settings)
    }
  }
}

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.settings.get, () => loadSettings())
  ipcMain.handle(IPC.settings.setLocale, async (_e, locale: unknown) => {
    const saved = setLocale(normalizeAppLocale(locale))
    await changeMainLocale(saved.locale)
    broadcastSettings(saved)
    return saved
  })
  ipcMain.handle(IPC.settings.setPauseChatOnHover, (_e, enabled: unknown) => {
    const saved = setPauseChatOnHover(enabled === true)
    broadcastSettings(saved)
    return saved
  })
  ipcMain.handle(IPC.settings.setShowFocusModeShortcut, (_e, enabled: unknown) => {
    const saved = setShowFocusModeShortcut(enabled === true)
    broadcastSettings(saved)
    return saved
  })
  ipcMain.handle(IPC.settings.setHighlights, (_e, rules: HighlightRule[]) => {
    const list = Array.isArray(rules) ? rules : []
    const saved = setHighlights(
      list.map((rule) => ({
        ...rule,
        id: rule.id && String(rule.id).trim() ? rule.id : createHighlightId()
      }))
    )
    broadcastSettings(saved)
    return saved
  })
  ipcMain.handle(IPC.settings.setHighlightPreferences, (_e, preferences: HighlightPreferences) => {
    const saved = setHighlightPreferences(preferences)
    broadcastSettings(saved)
    return saved
  })
  ipcMain.handle(IPC.settings.setActionButtons, (_e, buttons: ChatActionButton[]) => {
    const list = Array.isArray(buttons) ? buttons : []
    const saved = setActionButtons(
      list.map((button) => ({
        ...button,
        id:
          button.id && String(button.id).trim()
            ? button.id
            : createActionId()
      }))
    )
    broadcastSettings(saved)
    return saved
  })
  ipcMain.handle(
    IPC.settings.highlightPresets,
    () => HIGHLIGHT_PRESET_COLORS
  )
}
