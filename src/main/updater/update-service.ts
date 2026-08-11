import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { AppUpdateState } from '../../shared/contracts/update'
import { IPC } from '../../shared/contracts/ipc'
import { canUseAutoUpdater } from './update-eligibility'
import type { UpdateWindowController } from './update-window-controller'

const { autoUpdater } = electronUpdater

export class UpdateService {
  private state: AppUpdateState = {
    status: canUseAutoUpdater() ? 'idle' : 'unsupported',
    currentVersion: app.getVersion()
  }
  private checking: Promise<AppUpdateState> | null = null
  private downloading: Promise<AppUpdateState> | null = null
  private manualCheck = false

  constructor(private readonly windowController: UpdateWindowController) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false
    autoUpdater.on('checking-for-update', () => this.setState({ status: 'checking' }))
    autoUpdater.on('update-available', (info) => {
      this.setState({ status: 'available', availableVersion: info.version })
      this.windowController.open()
    })
    autoUpdater.on('update-not-available', () => this.setState({ status: 'up-to-date' }))
    autoUpdater.on('download-progress', (progress) => this.setState({
      status: 'downloading', progressPercent: Math.max(0, Math.min(100, progress.percent))
    }))
    autoUpdater.on('update-downloaded', (info) => this.setState({
      status: 'downloaded', availableVersion: info.version, progressPercent: 100
    }))
    autoUpdater.on('error', (error) => {
      console.error('[updater]', error)
      this.setState(this.manualCheck || this.state.status === 'downloading'
        ? { status: 'error', error: error.message }
        : { status: 'idle' })
    })
  }

  getState(): AppUpdateState { return { ...this.state } }

  check(manual = true): Promise<AppUpdateState> {
    if (!canUseAutoUpdater()) return Promise.resolve(this.getState())
    if (this.checking) return this.checking
    this.manualCheck = manual
    this.setState({ status: 'checking', error: undefined })
    this.checking = autoUpdater.checkForUpdates().then(() => this.getState()).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[updater]', error)
      this.setState(manual ? { status: 'error', error: message } : { status: 'idle' })
      return this.getState()
    }).finally(() => { this.checking = null; this.manualCheck = false })
    return this.checking
  }

  download(): Promise<AppUpdateState> {
    if (this.state.status !== 'available' && this.state.status !== 'error') return Promise.resolve(this.getState())
    if (this.downloading) return this.downloading
    this.setState({ status: 'downloading', progressPercent: 0, error: undefined })
    this.downloading = autoUpdater.downloadUpdate().then(() => this.getState()).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ status: 'error', error: message })
      return this.getState()
    }).finally(() => { this.downloading = null })
    return this.downloading
  }

  install(): void {
    if (this.state.status === 'downloaded') autoUpdater.quitAndInstall(false, true)
  }

  private setState(patch: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...patch, currentVersion: app.getVersion() }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC.update.changed, this.getState())
    }
  }
}
