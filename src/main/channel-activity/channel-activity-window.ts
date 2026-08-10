import type {
  ChannelActivityModerationAction,
  ChannelActivityModerationState,
  ChannelActivityPage,
  ChannelActivityTarget,
  ChannelActivityWindowState
} from '../../shared/types'

export interface ChannelActivityPopup {
  focus(): void
  close(): void
  send(state: ChannelActivityWindowState): void
  isDestroyed(): boolean
  onClosed?(callback: () => void): void
}

type Service = {
  open(target: ChannelActivityTarget): Promise<ChannelActivityPage>
  loadMore(requestId: string): Promise<ChannelActivityPage>
  close(requestId?: string): void
  moderation(target: ChannelActivityTarget): ChannelActivityModerationAction[]
  runModeration(target: ChannelActivityTarget, iconType: string): Promise<ChannelActivityModerationAction>
}

export class ChannelActivityWindowController {
  private popup: ChannelActivityPopup | null = null
  private generation = 0
  private target: ChannelActivityTarget | null = null
  private page: ChannelActivityPage | null = null
  private moderation: ChannelActivityModerationState | undefined

  constructor(private readonly createPopup: () => ChannelActivityPopup, private readonly service: Service) {}

  async open(target: ChannelActivityTarget): Promise<void> {
    const generation = ++this.generation
    this.target = target
    this.page = null
    this.moderation = undefined
    if (!this.popup || this.popup.isDestroyed()) {
      this.popup = this.createPopup()
      this.popup.onClosed?.(() => this.release())
    } else this.popup.focus()
    this.popup.send({ status: 'loading', target })
    try {
      const page = await this.service.open(target)
      if (generation !== this.generation || !this.popup || this.popup.isDestroyed()) return
      this.page = page
      const actions = this.service.moderation(target)
      this.moderation = actions.length ? { actions } : undefined
      this.sendReady()
    } catch (error) {
      if (generation !== this.generation || !this.popup || this.popup.isDestroyed()) return
      this.popup.send({ status: 'error', target, message: error instanceof Error ? error.message : String(error) })
    }
  }

  async runModeration(iconType: string): Promise<void> {
    if (!this.popup || !this.target || !this.page || !this.moderation || this.moderation.busyActionId || this.moderation.completedKind) return
    const action = this.moderation.actions.find((candidate) => candidate.iconType === iconType)
    if (!action) return
    const generation = this.generation
    const target = this.target
    this.moderation = { ...this.moderation, busyActionId: action.id, error: undefined }
    this.sendReady()
    try {
      const completed = await this.service.runModeration(target, iconType)
      if (generation !== this.generation || target !== this.target || !this.popup || this.popup.isDestroyed()) return
      this.moderation = {
        actions: completed.kind === 'hide' ? [] : this.moderation.actions,
        completedKind: completed.kind
      }
      this.sendReady()
    } catch (error) {
      if (generation !== this.generation || target !== this.target || !this.popup || this.popup.isDestroyed()) return
      this.moderation = {
        actions: this.moderation.actions,
        error: error instanceof Error ? error.message : String(error)
      }
      this.sendReady()
    }
  }

  async loadMore(): Promise<void> {
    if (!this.popup || !this.target || !this.page || !this.page.hasMore) return
    const generation = this.generation
    this.sendReady(true)
    try {
      const page = await this.service.loadMore(this.page.requestId)
      if (generation !== this.generation || !this.popup || this.popup.isDestroyed() || !this.target) return
      this.page = page
      this.sendReady()
    } catch (error) {
      if (generation !== this.generation || !this.popup || !this.target) return
      this.popup.send({ status: 'error', target: this.target, message: error instanceof Error ? error.message : String(error) })
    }
  }

  close(): void {
    const popup = this.popup
    this.release()
    if (popup && !popup.isDestroyed()) popup.close()
  }

  currentTarget(): ChannelActivityTarget | null { return this.target }

  private sendReady(loadingMore = false): void {
    if (!this.popup || !this.target || !this.page || this.popup.isDestroyed()) return
    this.popup.send({ status: 'ready', target: this.target, page: this.page, loadingMore: loadingMore || undefined, moderation: this.moderation })
  }

  private release(): void {
    this.generation++
    this.service.close(this.page?.requestId)
    this.popup = null
    this.target = null
    this.page = null
    this.moderation = undefined
  }
}
