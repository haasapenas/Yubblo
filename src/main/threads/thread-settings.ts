import type { AppSettings } from '../../shared/contracts/settings'
import { loadSettings, saveSettings } from '../settings-store'

export function setChatThreads(enabled: boolean): AppSettings {
  const current = loadSettings()
  return saveSettings({ ...current, chatThreads: enabled === true })
}
