import type { ChannelActivityHandleInput, ChannelActivityModerationAction, ChannelActivityPage, ChannelActivityTarget, ModMenuResult } from '../../shared/types'
import type { ChannelSession } from '../chat/chat-session'
import { buildChannelActivityParams } from './channel-activity-params'
import { ChannelActivityService } from './channel-activity-service'
import { readCachedChannelActivityActions, requireCachedChannelActivityAction } from './channel-activity-moderation'

type Deps = {
  session(videoId: string): ChannelSession | undefined
  execute(endpoint: string, payload: Record<string, unknown>): Promise<unknown>
  unavailable(message: string): Error
  resolveBrowseId(handle: string): Promise<string>
  isSelfTarget(target: ChannelActivityTarget): boolean
  selfActivityUnavailable(): string
  canModerate(session: ChannelSession): boolean
  runModAction(messageId: string, iconType: string, videoId: string): Promise<unknown>
}

export class ChannelActivityCoordinator {
  private readonly service: ChannelActivityService
  private readonly resolvedHandles = new WeakMap<ChannelSession, Map<string, string>>()
  constructor(private readonly deps: Deps) { this.service = new ChannelActivityService(deps.execute) }
  remember(videoId: string, authorChannelId: string, params: string): void { this.deps.session(videoId)?.channelActivityParams.set(authorChannelId, params) }
  decorateMenu(menu: ModMenuResult, session: ChannelSession, authorChannelId?: string): ModMenuResult { return { ...menu, channelActivityAvailable: menu.canModerate && !!authorChannelId && !!session.youtubeChannelId } }
  async resolveTarget(input: ChannelActivityHandleInput): Promise<ChannelActivityTarget> {
    const session = this.deps.session(input.videoId)
    if (!session || !session.youtubeChannelId || !this.deps.canModerate(session)) throw this.deps.unavailable('Channel activity is unavailable for this live.')
    const handle = input.handle.trim().replace(/^@/, '')
    if (!handle) throw this.deps.unavailable('Use /user @handle.')
    const cache = this.resolvedHandles.get(session) || new Map<string, string>()
    this.resolvedHandles.set(session, cache)
    const cacheKey = handle.toLocaleLowerCase()
    const authorChannelId = input.authorChannelId || cache.get(cacheKey) || await this.deps.resolveBrowseId(handle)
    cache.set(cacheKey, authorChannelId)
    return {
      videoId: input.videoId,
      messageId: `command:user:${authorChannelId}`,
      authorChannelId,
      authorName: input.authorName || `@${handle}`
    }
  }
  moderation(target: ChannelActivityTarget): ChannelActivityModerationAction[] {
    const session = this.deps.session(target.videoId)
    return session ? readCachedChannelActivityActions(session, target) : []
  }
  async runModeration(target: ChannelActivityTarget, iconType: string): Promise<ChannelActivityModerationAction> {
    const session = this.deps.session(target.videoId)
    if (!session) throw this.deps.unavailable('Transmission is no longer open.')
    const action = requireCachedChannelActivityAction(session, target, iconType)
    await this.deps.runModAction(target.messageId, iconType, target.videoId)
    return action
  }
  async open(target: ChannelActivityTarget): Promise<ChannelActivityPage> {
    const session = this.deps.session(target.videoId)
    if (!session) throw this.deps.unavailable('Historico do canal indisponivel para esta mensagem.')
    const isOwnChannel = session.youtubeChannelId === target.authorChannelId
    if (isOwnChannel && this.deps.isSelfTarget(target)) throw this.deps.unavailable(this.deps.selfActivityUnavailable())
    const params = session.channelActivityParams.get(target.authorChannelId) || buildChannelActivityParams(session.youtubeChannelId || '', target.videoId, target.authorChannelId)
    if (!params) throw this.deps.unavailable('Historico do canal indisponivel para esta mensagem.')
    return this.service.open(target, params)
  }
  loadMore(requestId: string): Promise<ChannelActivityPage> { return this.service.loadMore(requestId) }
  close(requestId?: string): void { this.service.close(requestId) }
}
