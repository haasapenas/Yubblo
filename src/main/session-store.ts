import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

const FILE_NAME = 'session.enc'

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE_NAME)
}

export function saveCookieString(cookie: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback local only (dev machines sem keychain) — ainda no userData
    writeFileSync(storePath(), Buffer.from(cookie, 'utf8'))
    return
  }
  const encrypted = safeStorage.encryptString(cookie)
  writeFileSync(storePath(), encrypted)
}

export function loadCookieString(): string | null {
  const path = storePath()
  if (!existsSync(path)) return null
  try {
    const buf = readFileSync(path)
    if (!safeStorage.isEncryptionAvailable()) {
      return buf.toString('utf8')
    }
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

export function clearSession(): void {
  const path = storePath()
  if (existsSync(path)) unlinkSync(path)
}
