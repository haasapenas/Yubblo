/**
 * Controla a janela reutilizável de registros de moderação.
 */
import type { ModerationLogAppendEvent, ModerationLogErrorEvent } from '../../shared/contracts/moderation-logs'
import { IPC } from '../../shared/contracts/ipc'
import type { ModerationLogsPopup } from './create-moderation-logs-popup'
import type { ModerationLogRecorder } from './moderation-log-recorder'

export class ModerationLogWindowController {
  private popup: ModerationLogsPopup | null = null
  private unsubAppend: (() => void) | null = null
  private unsubError: (() => void) | null = null

  constructor(
    private readonly createPopup: () => ModerationLogsPopup,
    private readonly recorder: ModerationLogRecorder
  ) {}

  open(): void {
    if (!this.popup || this.popup.isDestroyed()) {
      this.popup = this.createPopup()
      this.popup.onClosed(() => this.release())
      this.bindLiveUpdates()
      return
    }
    this.popup.focus()
  }

  close(): void {
    if (this.popup && !this.popup.isDestroyed()) this.popup.close()
    this.release()
  }

  isOpen(): boolean {
    return !!this.popup && !this.popup.isDestroyed()
  }

  private bindLiveUpdates(): void {
    this.unsubAppend?.()
    this.unsubError?.()
    this.unsubAppend = this.recorder.onAppend((payload) => {
      if (!this.popup || this.popup.isDestroyed()) return
      const event: ModerationLogAppendEvent = {
        streamKey: payload.streamKey,
        entry: payload.entry
      }
      this.popup.send(IPC.moderationLogs.appended, event)
    })
    this.unsubError = this.recorder.onError((payload) => {
      if (!this.popup || this.popup.isDestroyed()) return
      const event: ModerationLogErrorEvent = {
        message: payload.message,
        streamKey: payload.streamKey
      }
      this.popup.send(IPC.moderationLogs.error, event)
    })
  }

  private release(): void {
    this.unsubAppend?.()
    this.unsubError?.()
    this.unsubAppend = null
    this.unsubError = null
    this.popup = null
  }
}
