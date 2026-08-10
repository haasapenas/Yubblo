import type { SettingsPopup } from './create-settings-popup'

export class SettingsWindowController {
  private popup: SettingsPopup | null = null

  constructor(private readonly createPopup: () => SettingsPopup) {}

  open(): void {
    if (!this.popup || this.popup.isDestroyed()) {
      this.popup = this.createPopup()
      this.popup.onClosed(() => {
        this.popup = null
      })
      return
    }
    this.popup.focus()
  }

  close(): void {
    if (this.popup && !this.popup.isDestroyed()) this.popup.close()
    this.popup = null
  }
}
