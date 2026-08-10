import { ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type { ChatSearchWindowState } from '../../shared/contracts/chat-search'
import type { ChatSearchWindowController } from '../chat-search/chat-search-window'

export function registerChatSearchIpc(controller: ChatSearchWindowController): void {
  ipcMain.handle(IPC.chat.openSearchWindow, (_e, state: ChatSearchWindowState) => {
    if (!state || !Array.isArray(state.messages)) {
      throw new Error('Invalid search window payload')
    }
    controller.open({
      channelLabel: String(state.channelLabel || 'chat'),
      videoId: state.videoId ?? null,
      messages: state.messages.map((m) => ({
        id: String(m.id || ''),
        authorName: String(m.authorName || ''),
        text: String(m.text || ''),
        timestamp: Number(m.timestamp) || Date.now(),
        isModerator: !!m.isModerator,
        isMember: !!m.isMember,
        isOwner: !!m.isOwner,
        isSelf: !!m.isSelf,
        systemKind: m.systemKind,
        removed: !!m.removed
      }))
    })
  })

  ipcMain.handle(IPC.chat.closeSearchWindow, () => {
    controller.close()
  })
}
