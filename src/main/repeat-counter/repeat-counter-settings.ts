import type { AppSettings } from '../../shared/contracts/settings'
import { loadSettings, saveSettings } from '../settings-store'

export function setRepeatCounter(enabled: boolean): AppSettings {
  const current = loadSettings()
  return saveSettings({ ...current, repeatCounter: enabled === true })
}
