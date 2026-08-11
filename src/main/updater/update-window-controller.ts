import type { UpdatePopup } from './create-update-popup'

export class UpdateWindowController {
  private popup: UpdatePopup | null = null
  constructor(private readonly createPopup: () => UpdatePopup) {}
  open(): void {
    if (!this.popup || this.popup.isDestroyed()) {
      this.popup = this.createPopup()
      this.popup.onClosed(() => { this.popup = null })
      return
    }
    this.popup.focus()
  }
  close(): void {
    if (this.popup && !this.popup.isDestroyed()) this.popup.close()
    this.popup = null
  }
}

