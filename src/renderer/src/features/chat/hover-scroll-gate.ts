/** Regra pura da pausa de auto-scroll durante hover. */
export class HoverScrollGate {
  private paused = false

  constructor(
    private enabled: boolean,
    private readonly forceBottom: () => void,
    private readonly onPauseChange: (paused: boolean) => void = () => {}
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled && this.paused) {
      this.setPaused(false)
      this.forceBottom()
    }
  }

  enter(): void {
    if (this.enabled) this.setPaused(true)
  }

  leave(): void {
    if (!this.paused) return
    this.setPaused(false)
    this.forceBottom()
  }

  shouldAutoScroll(stickToBottom: boolean): boolean {
    return stickToBottom && !this.paused
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return
    this.paused = paused
    this.onPauseChange(paused)
  }
}
