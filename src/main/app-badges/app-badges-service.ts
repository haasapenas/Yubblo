import { app, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import bundled from '../../../badges.json'
import { APP_BADGES_URL, parseAppBadges, type AppBadgeMap } from '../../shared/app-badges'
import { IPC } from '../../shared/contracts/ipc'

const REFRESH_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000

export class AppBadgesService {
  private badges: AppBadgeMap = parseAppBadges(bundled) ?? {}
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly fetchJson: (url: string) => Promise<unknown> = defaultFetchJson,
    private readonly cachePath: () => string = () => join(app.getPath('userData'), 'app-badges.json')
  ) {}

  get(): AppBadgeMap {
    return { ...this.badges }
  }

  async start(): Promise<void> {
    await this.loadCache()
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async refresh(): Promise<void> {
    try {
      const parsed = parseAppBadges(await this.fetchJson(APP_BADGES_URL))
      if (!parsed) return
      this.update(parsed)
      await writeFile(this.cachePath(), JSON.stringify(parsed), 'utf8').catch(() => undefined)
    } catch (error) {
      console.warn('[app-badges] refresh falhou:', error instanceof Error ? error.message : error)
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const cached = parseAppBadges(JSON.parse(await readFile(this.cachePath(), 'utf8')))
      if (cached) this.update(cached)
    } catch {
      return
    }
  }

  private update(next: AppBadgeMap): void {
    if (JSON.stringify(next) === JSON.stringify(this.badges)) return
    this.badges = next
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC.appBadges.changed, this.get())
    }
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}
