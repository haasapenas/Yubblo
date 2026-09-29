import type { BrowserWindow } from 'electron'
import type { AppSettings } from '../../shared/contracts/settings'
import { loadSettings, saveSettings } from '../settings-store'

export function applyAlwaysOnTop(win: BrowserWindow | null, enabled: boolean): void {
  if (!win || win.isDestroyed()) return
  if (enabled) win.setAlwaysOnTop(true, 'screen-saver')
  else win.setAlwaysOnTop(false)
}

export function setAlwaysOnTop(win: BrowserWindow | null, enabled: boolean): AppSettings {
  const current = loadSettings()
  const saved = saveSettings({ ...current, alwaysOnTop: current.alwaysOnTopButton && enabled === true })
  applyAlwaysOnTop(win, saved.alwaysOnTop)
  return saved
}

export function setAlwaysOnTopButton(win: BrowserWindow | null, enabled: boolean): AppSettings {
  const current = loadSettings()
  const visible = enabled === true
  const saved = saveSettings({
    ...current,
    alwaysOnTopButton: visible,
    alwaysOnTop: visible ? current.alwaysOnTop : false
  })
  applyAlwaysOnTop(win, saved.alwaysOnTop)
  return saved
}
