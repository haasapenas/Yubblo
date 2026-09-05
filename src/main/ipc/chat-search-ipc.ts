import { ipcMain } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type { ChatSearchWindowState } from '../../shared/contracts/chat-search'
import { sanitizeChatSearchWindowState } from '../chat-search/sanitize-search-state'
import type { ChatSearchWindowController } from '../chat-search/chat-search-window'

export function registerChatSearchIpc(controller: ChatSearchWindowController): void {
  ipcMain.handle(IPC.chat.openSearchWindow, (_e, state: ChatSearchWindowState) => {
    if (!state || !Array.isArray(state.messages)) {
      throw new Error('Invalid search window payload')
    }
    controller.open(sanitizeChatSearchWindowState(state))
  })

  ipcMain.handle(IPC.chat.closeSearchWindow, () => {
    controller.close()
  })
}
