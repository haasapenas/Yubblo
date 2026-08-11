import { app } from 'electron'

export function canUseAutoUpdater(): boolean {
  if (process.platform !== 'win32' || !app.isPackaged) return false
  if (process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR) return false
  return !/win-unpacked/i.test(process.resourcesPath)
}

