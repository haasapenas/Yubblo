import { randomUUID } from 'node:crypto'
import { CHANNEL_ACTIVITY_MESSAGES_PER_LIVE_LIMIT, type ChannelActivityGroup, type ChannelActivityPage, type ChannelActivityProfile, type ChannelActivityReputation, type ChannelActivityTarget } from '../../shared/types'
import { parseChannelActivityPage } from './channel-activity-parser'
import { mergeChannelActivityGroups } from './channel-activity-merge'

type Execute = (endpoint: string, payload: Record<string, unknown>) => Promise<unknown>

function rejectWhenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const rejectExpired = () => reject(new Error('Channel activity request expired'))
    if (signal.aborted) rejectExpired()
    else signal.addEventListener('abort', rejectExpired, { once: true })
  })
}

export class ChannelActivityService {
  private active: { id: string; generation: number; controller: AbortController; continuation?: string; groups: ChannelActivityGroup[]; profile?: ChannelActivityProfile; reputation?: ChannelActivityReputation } | null = null
  private generation = 0
  private loadingRequestId: string | null = null
  constructor(private readonly execute: Execute) {}

  async open(target: ChannelActivityTarget, params: string): Promise<ChannelActivityPage> {
    this.close()
    const active = { id: randomUUID(), generation: this.generation, controller: new AbortController(), groups: [] as ChannelActivityGroup[] }
    this.active = active
    return this.fetch(active, { panelId: 'PAlc_channel_activity', params, parse: false }, target)
  }

  async loadMore(requestId: string): Promise<ChannelActivityPage> {
    const active = this.active
    if (!active || active.id !== requestId) throw new Error('Channel activity request expired')
    if (!active.continuation) return { requestId, groups: active.groups, messageCount: active.groups.reduce((sum, group) => sum + group.messages.length, 0), hasMore: false }
    return this.fetch(active, { continuation: active.continuation, parse: false })
  }

  close(requestId?: string): void {
    if (requestId && this.active?.id !== requestId) return
    this.active?.controller.abort()
    this.active = null
    this.generation++
  }

  private async fetch(active: NonNullable<ChannelActivityService['active']>, payload: Record<string, unknown>, target?: ChannelActivityTarget): Promise<ChannelActivityPage> {
    if (this.loadingRequestId === active.id) throw new Error('Channel activity request already in progress')
    this.loadingRequestId = active.id
    try {
      const response = await Promise.race([
        this.execute('get_panel', payload),
        rejectWhenAborted(active.controller.signal)
      ])
      if (this.active !== active || active.generation !== this.generation) throw new Error('Channel activity request expired')
      const raw = response && typeof response === 'object' && 'data' in response ? (response as { data: unknown }).data : response
      const parsed = parseChannelActivityPage(raw)
      active.groups = mergeChannelActivityGroups(active.groups, parsed.groups, CHANNEL_ACTIVITY_MESSAGES_PER_LIVE_LIMIT)
      active.continuation = parsed.continuation
      if (parsed.profile && !parsed.profile.channelId && target) parsed.profile.channelId = target.authorChannelId
      active.profile ||= parsed.profile
      active.reputation ||= parsed.reputation
      const messageCount = active.groups.reduce((sum, group) => sum + group.messages.length, 0)
      return { requestId: active.id, profile: active.profile, reputation: active.reputation, groups: active.groups, messageCount, hasMore: !!active.continuation }
    } finally { if (this.loadingRequestId === active.id) this.loadingRequestId = null }
  }
}
