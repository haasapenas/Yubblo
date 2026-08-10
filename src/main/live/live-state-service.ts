import type { AppError, LivePinnedMessage, LivePollState } from '../../shared/types'
import { LIVE_POLLS_ENABLED } from '../../shared/feature-flags'
import type { ChannelSession } from '../chat/chat-session'
import {
  applyHarvestedVotes,
  extractPollsFromLiveChatResponse,
  harvestChoiceVotesFromTree,
  mergePollState,
  parsePollFromAction,
  parsePollFromRawAction,
  pollDismissKeys,
  pollFingerprint,
  pollPercentsKey,
  toPublicPoll,
  type ParsedLivePoll
} from './live-poll'
import {
  parsePinnedFromAction,
  parsePinnedFromRawAction,
  pinnedDismissKey,
  pinnedFingerprint,
  type ParsedPinned
} from './live-pinned'

interface LiveStateContext {
  session(videoId: string): ChannelSession | undefined
  activeVideoId(): string | null
  emitPoll(poll: LivePollState | null): void
  emitPinned(pin: LivePinnedMessage | null): void
  execute(apiUrl: string, body: Record<string, unknown>): Promise<unknown>
  error(code: AppError['code'], message: string): Error
}

export class LiveStateService {
  constructor(private readonly context: LiveStateContext) {}

  emitLivePoll(videoId: string): void {
    if (!LIVE_POLLS_ENABLED) return
    const poll = this.context.session(videoId)?.livePoll
    this.context.emitPoll(poll ? toPublicPoll(poll, videoId) : null)
  }

  ingestResponse(videoId: string, data: unknown): void {
    const session = this.context.session(videoId)
    if (!session) return

    if (LIVE_POLLS_ENABLED) {
      for (const poll of extractPollsFromLiveChatResponse(data)) {
        this.applyLivePollUpdate(videoId, poll)
      }
      if (session.livePoll && !session.livePoll.closed && session.livePoll.choices.length) {
        const harvested = harvestChoiceVotesFromTree(
          data,
          session.livePoll.choices.map((choice) => choice.text)
        )
        if (harvested.size > 0) {
          this.applyLivePollUpdate(
            videoId,
            applyHarvestedVotes(session.livePoll, harvested)
          )
        }
      }
    }

    const pin = parsePinnedFromRawAction(data) || parsePinnedFromAction(data)
    if (pin) this.applyPinnedUpdate(videoId, pin)
  }

  handleAction(action: unknown, videoId: string): boolean {
    if (!action || typeof action !== 'object' || !videoId) return false
    const type = String((action as { type?: string }).type || '')

    if (LIVE_POLLS_ENABLED) {
      const poll = parsePollFromAction(action) || parsePollFromRawAction(action)
      if (poll) {
        this.applyLivePollUpdate(videoId, poll)
        if (
          type === 'AddBannerToLiveChatCommand' ||
          type === 'UpdateLiveChatPollAction' ||
          type.includes('UpdateLiveChatPoll')
        ) return true
      }
    }

    const pin = parsePinnedFromAction(action) || parsePinnedFromRawAction(action)
    if (!pin) return false
    this.applyPinnedUpdate(videoId, pin)
    return (
      type === 'AddBannerToLiveChatCommand' ||
      type === 'RemoveBannerForLiveChatCommand' ||
      type.includes('Banner')
    )
  }

  applyLivePollUpdate(videoId: string, parsed: ParsedLivePoll): void {
    if (!LIVE_POLLS_ENABLED || parsed.closed) return
    const session = this.context.session(videoId)
    if (!session) return
    if (!session.livePoll && parsed.choices.length === 0) return

    const merged = mergePollState(session.livePoll, parsed)
    if (!merged.choices.length) return
    if (this.isPollDismissed(session, merged)) {
      if (session.livePoll && this.isPollDismissed(session, session.livePoll)) {
        session.livePoll = null
        session.livePollFingerprint = undefined
        this.context.emitPoll(null)
      }
      return
    }

    const fingerprint = pollFingerprint(merged)
    if (session.livePollFingerprint === fingerprint) return
    session.livePoll = merged
    session.livePollFingerprint = fingerprint
    session.livePollPercentsLog = pollPercentsKey(merged)
    this.context.emitPoll(toPublicPoll(merged, videoId))
  }

  getLivePoll(videoId?: string | null): LivePollState | null {
    if (!LIVE_POLLS_ENABLED) return null
    const resolvedVideoId = videoId || this.context.activeVideoId()
    if (!resolvedVideoId) return null
    const session = this.context.session(resolvedVideoId)
    if (!session?.livePoll || this.isPollDismissed(session, session.livePoll)) {
      return null
    }
    return toPublicPoll(session.livePoll, resolvedVideoId)
  }

  dismissLivePoll(pollId?: string | null, videoId?: string | null): void {
    if (!LIVE_POLLS_ENABLED) return
    const resolvedVideoId = videoId || this.context.activeVideoId()
    if (!resolvedVideoId) return
    const session = this.context.session(resolvedVideoId)
    if (!session?.livePoll) {
      this.context.emitPoll(null)
      return
    }
    void pollId
    for (const key of pollDismissKeys(session.livePoll)) {
      session.dismissedPollKeys.add(key)
    }
    if (session.dismissedPollKeys.size > 40) {
      session.dismissedPollKeys = new Set([...session.dismissedPollKeys].slice(-20))
    }
    session.livePoll = null
    session.livePollFingerprint = undefined
    session.livePollPercentsLog = undefined
    this.context.emitPoll(null)
  }

  applyPinnedUpdate(videoId: string, parsed: ParsedPinned): void {
    const session = this.context.session(videoId)
    if (!session) return
    if (parsed.kind === 'clear') {
      if (!session.pinnedMessage) return
      const target = parsed.targetActionId
      if (
        target &&
        session.pinnedMessage.actionId &&
        session.pinnedMessage.actionId !== target &&
        session.pinnedMessage.id !== target
      ) return
      session.pinnedMessage = null
      session.pinnedFingerprint = undefined
      this.context.emitPinned(null)
      return
    }

    const pin = { ...parsed.pin, videoId }
    if (session.dismissedPinKeys.has(pinnedDismissKey(pin))) return
    const fingerprint = pinnedFingerprint(pin)
    if (session.pinnedFingerprint === fingerprint) return
    session.pinnedMessage = pin
    session.pinnedFingerprint = fingerprint
    this.context.emitPinned(pin)
  }

  getPinnedMessage(videoId?: string | null): LivePinnedMessage | null {
    const resolvedVideoId = videoId || this.context.activeVideoId()
    if (!resolvedVideoId) return null
    const session = this.context.session(resolvedVideoId)
    if (!session?.pinnedMessage) return null
    if (session.dismissedPinKeys.has(pinnedDismissKey(session.pinnedMessage))) {
      return null
    }
    return { ...session.pinnedMessage, videoId: resolvedVideoId }
  }

  dismissPinnedMessage(pinId?: string | null, videoId?: string | null): void {
    const resolvedVideoId = videoId || this.context.activeVideoId()
    if (!resolvedVideoId) return
    const session = this.context.session(resolvedVideoId)
    if (!session?.pinnedMessage) {
      this.context.emitPinned(null)
      return
    }
    void pinId
    session.dismissedPinKeys.add(pinnedDismissKey(session.pinnedMessage))
    if (session.dismissedPinKeys.size > 30) {
      session.dismissedPinKeys = new Set([...session.dismissedPinKeys].slice(-15))
    }
    session.pinnedMessage = null
    session.pinnedFingerprint = undefined
    this.context.emitPinned(null)
  }

  clearPinnedDismissals(videoId: string): void {
    this.context.session(videoId)?.dismissedPinKeys.clear()
  }

  async voteLivePoll(
    pollId: string,
    optionId: string,
    videoId?: string | null
  ): Promise<LivePollState | null> {
    if (!LIVE_POLLS_ENABLED) return null
    const resolvedVideoId = videoId || this.context.activeVideoId()
    if (!resolvedVideoId) {
      throw this.context.error('CHAT_UNAVAILABLE', 'Nenhuma live ativa.')
    }
    const session = this.context.session(resolvedVideoId)
    if (!session?.livePoll || session.livePoll.pollId !== pollId) {
      throw this.context.error('UNKNOWN', 'Enquete nao encontrada nesta live.')
    }
    if (session.livePoll.closed) {
      throw this.context.error('UNKNOWN', 'Esta enquete ja foi encerrada.')
    }
    if (session.livePoll.selectedOptionId) {
      throw this.context.error('UNKNOWN', 'Voce ja votou nesta enquete.')
    }
    const endpoint = session.livePoll.voteEndpoints.get(optionId)
    if (!endpoint) throw this.context.error('UNKNOWN', 'Sem endpoint de voto.')

    const response = await this.context.execute(endpoint.apiUrl, {
      ...endpoint.body,
      parse: false
    }) as { status_code?: number; data?: unknown }
    if ((response.status_code ?? 200) >= 400) {
      throw this.context.error('UNKNOWN', 'YouTube recusou o voto.')
    }
    session.livePoll.selectedOptionId = optionId
    const update =
      parsePollFromRawAction(response.data ?? response) ||
      parsePollFromAction(response.data ?? response)
    if (update && !update.closed) {
      session.livePoll = mergePollState(session.livePoll, update)
      session.livePoll.selectedOptionId = optionId
    }
    this.emitLivePoll(resolvedVideoId)
    return toPublicPoll(session.livePoll, resolvedVideoId)
  }

  private isPollDismissed(
    session: ChannelSession,
    poll: ParsedLivePoll
  ): boolean {
    return pollDismissKeys(poll).some((key) => session.dismissedPollKeys.has(key))
  }
}
