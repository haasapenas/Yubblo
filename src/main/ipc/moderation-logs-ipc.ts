import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type {
  ModerationLogFilters,
  ModerationLogPageRequest
} from '../../shared/contracts/moderation-logs'
import { deleteModerationLogStream } from '../moderation-logs/moderation-log-delete'
import { moderationLogExporter } from '../moderation-logs/moderation-log-exporter'
import { moderationLogReader } from '../moderation-logs/moderation-log-reader'
import { moderationLogRecorder } from '../moderation-logs/moderation-log-recorder'
import type { ModerationLogWindowController } from '../moderation-logs/moderation-log-window'
import { loadSettings } from '../settings-store'

export function registerModerationLogsIpc(
  controller: ModerationLogWindowController,
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(IPC.moderationLogs.openWindow, () => {
    controller.open()
  })

  ipcMain.handle(IPC.moderationLogs.closeWindow, () => {
    controller.close()
  })

  ipcMain.handle(IPC.moderationLogs.listChannels, async () => {
    return moderationLogReader.listChannels()
  })

  ipcMain.handle(
    IPC.moderationLogs.readPage,
    async (_e, request: ModerationLogPageRequest) => {
      if (!request || typeof request !== 'object') {
        throw new Error('Invalid page request')
      }
      return moderationLogReader.readPage(request)
    }
  )

  ipcMain.handle(
    IPC.moderationLogs.exportCsv,
    async (
      _e,
      payload: {
        streamKey: string
        videoId?: string
        filters?: ModerationLogFilters
      }
    ) => {
      if (!payload?.streamKey) throw new Error('streamKey required')
      const locale = loadSettings().locale
      return moderationLogExporter.exportToFile({
        streamKey: String(payload.streamKey),
        videoId: payload.videoId,
        filters: payload.filters,
        locale,
        parentWindow: getMainWindow()
      })
    }
  )

  ipcMain.handle(
    IPC.moderationLogs.deleteStream,
    async (_e, streamKey: string) => {
      const key = String(streamKey || '').trim()
      if (!key) return { ok: false as const, error: 'stream_key_required' }
      return deleteModerationLogStream(key, moderationLogRecorder.getStore())
    }
  )
}
