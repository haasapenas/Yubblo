import type { ChatSearchWindowState } from '../../shared/contracts/chat-search'
import type { ChatSearchPopup } from './create-chat-search-popup'

/**
 * Controla a janela flutuante de busca no histórico do chat (Ctrl+F).
 */
export class ChatSearchWindowController {
  private popup: ChatSearchPopup | null = null

  constructor(private readonly createPopup: () => ChatSearchPopup) {}

  open(state: ChatSearchWindowState): void {
    if (!this.popup || this.popup.isDestroyed()) {
      this.popup = this.createPopup()
      this.popup.onClosed(() => {
        this.popup = null
      })
    } else {
      this.popup.focus()
    }
    this.popup.send(state)
  }

  /** Atualiza mensagens se a janela já estiver aberta (mesma live). */
  updateIfOpen(state: ChatSearchWindowState): void {
    if (!this.popup || this.popup.isDestroyed()) return
    this.popup.send(state)
  }

  close(): void {
    if (this.popup && !this.popup.isDestroyed()) this.popup.close()
    this.popup = null
  }
}
