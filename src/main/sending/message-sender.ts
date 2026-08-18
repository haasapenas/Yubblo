import type { Innertube } from 'youtubei.js'
import { cookieHasSendAuth } from '../auth'
import type { AppError, ChatMessage } from '../../shared/types'
import type { ChannelSession } from '../chat/chat-session'
import {
  formatCooldownHint,
  friendlyCooldownMessage,
  parseCooldownFromErrorText,
  parseCooldownFromSendResponse
} from './send-cooldown'
import {
  buildLiveChatSendParams,
  fastSendLiveChatMessage
} from './fast-send'
import { compileYoutubeMessage } from './youtube-message'

export interface PendingEcho {
  id: string
  text: string
  at: number
}

export function remainingSessionCooldownSec(
  session: Pick<ChannelSession, 'sendCooldownUntil'> | null | undefined,
  now = Date.now()
): number {
  if (!session?.sendCooldownUntil) return 0
  return Math.max(0, (session.sendCooldownUntil - now) / 1000)
}

export interface MessageSenderDeps {
  activeSession(): ChannelSession | null
  yt(): Innertube | null
  cookie(): string | null
  emit(message: ChatMessage, videoId: string): void
  emitSessions(): void
  selfIdentity(): { name: string; channelId?: string }
}

export class MessageSender {
  constructor(private readonly deps: MessageSenderDeps) {}

  async send(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return

    const session = this.deps.activeSession()
    const yt = this.deps.yt()
    if (!session?.liveChat || !yt) {
      throw this.error('CHAT_UNAVAILABLE', 'Nenhuma live aberta.')
    }

    const cookie = this.deps.cookie()
    if (!cookie) {
      throw this.error('NOT_LOGGED_IN', 'Faca login para enviar mensagens.')
    }
    if (!cookieHasSendAuth(cookie)) {
      throw this.error(
        'SEND_FAILED',
        'Login incompleto (sem SAPISID). Clique em Sair e entre de novo.'
      )
    }

    const videoId = session.info.videoId
    const wait = remainingSessionCooldownSec(session)
    if (wait > 0) {
      throw this.error(
        'SEND_FAILED',
        formatCooldownHint(wait, session.slowModeSeconds) ||
          `Aguarde ${Math.ceil(wait)}s para enviar`
      )
    }

    const compiled = compileYoutubeMessage(
      trimmed,
      session.youtubeDefaultEmojis.values()
    )
    const identity = this.deps.selfIdentity()
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    session.pendingSends.push({
      id: localId,
      text: trimmed,
      at: Date.now()
    })
    this.deps.emit(
      this.withSelfBadges(
        {
          id: localId,
          authorName: identity.name,
          authorChannelId: identity.channelId,
          text: trimmed,
          timestamp: Date.now(),
          parts: compiled.parts,
          isSelf: true,
          pending: false,
          awaitingEcho: true
        },
        session
      ),
      videoId
    )

    session.sendInFlight++
    session.poller?.beginSendPriority()
    const startedAt = performance.now()

    try {
      let ok = false
      let elapsedMs = 0
      let status = 0
      let errorMessage = ''
      let via = ''

      if ((!session.sendParams || !session.sendChannelId) && session.sendVideoId) {
        const channelId =
          session.sendChannelId ||
          session.youtubeChannelId ||
          identity.channelId ||
          ''
        if (channelId) {
          session.sendChannelId = channelId
          try {
            session.sendParams = buildLiveChatSendParams(
              session.sendVideoId,
              channelId
            )
            console.log(`[send] params reconstruidos channel=${channelId}`)
          } catch (error) {
            console.warn('[send] rebuild params failed', error)
          }
        }
      }

      if (
        session.sendParams &&
        session.sendVideoId &&
        session.sendChannelId
      ) {
        const benchmark = !session.sendBenchDone
        const fast = await fastSendLiveChatMessage({
          yt,
          cookie,
          videoId: session.sendVideoId,
          channelId: session.sendChannelId,
          params: session.sendParams,
          text: trimmed,
          segments: compiled.segments,
          benchmark
        })
        if (benchmark) session.sendBenchDone = true
        ok = fast.ok
        elapsedMs = fast.ms
        status = fast.status
        errorMessage = fast.error || ''
        via = fast.via || ''

        if (!ok) {
          const fromError = parseCooldownFromErrorText(fast.error || '')
          const fromBody = parseCooldownFromSendResponse(fast.bodyText || '')
          const isCooldown =
            fast.cooldownSeconds != null ||
            fromError.isCooldown ||
            fromBody.isCooldown
          if (isCooldown) {
            const seconds =
              fast.cooldownSeconds ||
              fromBody.seconds ||
              fromError.seconds ||
              session.slowModeSeconds ||
              5
            this.setCooldown(session, seconds, 'chat-delay')
            errorMessage = friendlyCooldownMessage(
              fromBody.message || fromError.message || fast.error,
              seconds
            )
            console.log(
              `[send] ok=false chat-delay status=${status} network=${elapsedMs}ms via=${via} cd=${seconds}s`
            )
          } else {
            console.log(
              `[send] ok=${ok} status=${status} network=${elapsedMs}ms via=${via}`
            )
          }
        } else {
          console.log(
            `[send] ok=${ok} status=${status} network=${elapsedMs}ms via=${via}`
          )
        }
      } else {
        console.warn(
          `[send] fast path skip: params=${!!session.sendParams} video=${!!session.sendVideoId} channel=${session.sendChannelId || 'vazio'}`
        )
      }

      const alreadyCooldown =
        !ok &&
        (parseCooldownFromErrorText(errorMessage).isCooldown ||
          remainingSessionCooldownSec(session) > 0)
      if (!ok && !alreadyCooldown && !compiled.hasYoutubeEmoji) {
        const fallbackStartedAt = performance.now()
        try {
          await session.liveChat.sendMessage(trimmed)
          elapsedMs = Math.round(performance.now() - fallbackStartedAt)
          ok = true
          via = 'youtubei-livechat'
          console.log(
            `[send] fallback youtubei-livechat network=${elapsedMs}ms`
          )
        } catch (error) {
          const message = (error as Error).message || ''
          const cooldown = parseCooldownFromErrorText(message)
          if (cooldown.isCooldown) {
            const seconds =
              cooldown.seconds || session.slowModeSeconds || 5
            this.setCooldown(session, seconds, 'youtubei-fallback')
            throw this.error(
              'SEND_FAILED',
              friendlyCooldownMessage(message, seconds)
            )
          }
          throw error
        }
      }

      if (!ok) {
        this.removePending(session, localId)
        const remaining = remainingSessionCooldownSec(session)
        const cooldownHint =
          remaining > 0
            ? formatCooldownHint(remaining, session.slowModeSeconds) ||
              friendlyCooldownMessage(errorMessage, remaining)
            : parseCooldownFromErrorText(errorMessage).isCooldown
              ? friendlyCooldownMessage(
                  errorMessage,
                  session.slowModeSeconds || 5
                )
              : ''
        throw this.error(
          'SEND_FAILED',
          status === 401
            ? 'YouTube recusou (401). Saia e entre de novo.'
            : cooldownHint ||
                errorMessage ||
                `Falha ao enviar (HTTP ${status || '?'})`
        )
      }

      if (session.slowModeSeconds > 0 && !this.canModerate(session)) {
        this.setCooldown(session, session.slowModeSeconds, 'slow-mode')
      }
      console.log(
        `[send] total=${Math.round(performance.now() - startedAt)}ms via=${via} as=${identity.name}`
      )
    } catch (error) {
      const appError = error as Error & AppError
      this.removePending(session, localId)
      this.deps.emit(
        {
          id: localId,
          authorName: identity.name,
          authorChannelId: identity.channelId,
          text: trimmed,
          timestamp: Date.now(),
          parts: compiled.parts,
          isSelf: true,
          pending: false,
          awaitingEcho: false,
          failed: true
        },
        videoId
      )

      if (appError.code) {
        const cooldown = parseCooldownFromErrorText(appError.message || '')
        if (cooldown.isCooldown) {
          const seconds =
            cooldown.seconds ||
            remainingSessionCooldownSec(session) ||
            session.slowModeSeconds ||
            5
          if (remainingSessionCooldownSec(session) <= 0) {
            this.setCooldown(session, seconds, 'catch-chat-delay')
          }
          throw this.error(
            'SEND_FAILED',
            friendlyCooldownMessage(appError.message, seconds)
          )
        }
        throw appError
      }

      const message = appError.message || 'Falha ao enviar mensagem.'
      if (message.includes('401')) {
        throw this.error(
          'SEND_FAILED',
          'YouTube recusou o envio (401). Saia da conta e entre de novo.'
        )
      }
      const cooldown = parseCooldownFromErrorText(message)
      if (cooldown.isCooldown) {
        const seconds =
          cooldown.seconds || session.slowModeSeconds || 5
        if (remainingSessionCooldownSec(session) <= 0) {
          this.setCooldown(session, seconds, 'catch-chat-delay')
        }
        throw this.error(
          'SEND_FAILED',
          friendlyCooldownMessage(message, seconds)
        )
      }
      throw this.error('SEND_FAILED', message)
    } finally {
      session.sendInFlight = Math.max(0, session.sendInFlight - 1)
      session.poller?.endSendPriority()
    }
  }

  private setCooldown(
    session: ChannelSession,
    seconds: number,
    reason?: string
  ): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return
    const until = Date.now() + Math.ceil(seconds) * 1000
    session.sendCooldownUntil = Math.max(
      session.sendCooldownUntil || 0,
      until
    )
    this.deps.emitSessions()
    console.log(
      `[send] cooldown ${Math.ceil(seconds)}s until=${new Date(session.sendCooldownUntil).toISOString()} ${reason || ''}`
    )
  }

  private removePending(session: ChannelSession, localId: string): void {
    session.pendingSends = session.pendingSends.filter(
      (pending) => pending.id !== localId
    )
  }

  private withSelfBadges(
    message: ChatMessage,
    session: ChannelSession
  ): ChatMessage {
    return {
      ...message,
      isModerator: !!(
        message.isModerator || session.selfBadges.isModerator
      ),
      isMember: !!(message.isMember || session.selfBadges.isMember),
      memberBadgeUrl: message.memberBadgeUrl || session.selfBadges.memberBadgeUrl,
      memberBadgeLabel: message.memberBadgeLabel || session.selfBadges.memberBadgeLabel,
      isOwner: !!(message.isOwner || session.selfBadges.isOwner),
      isVerified: !!(
        message.isVerified || session.selfBadges.isVerified
      )
    }
  }

  private canModerate(session: ChannelSession): boolean {
    return !!(
      session.canModerate ||
      session.selfBadges.isModerator ||
      session.selfBadges.isOwner
    )
  }

  private error(
    code: AppError['code'],
    message: string
  ): Error & AppError {
    const error = new Error(message) as Error & AppError
    error.code = code
    error.messageKey = ({
      NOT_LOGGED_IN: 'errors.loginRequired',
      CHANNEL_NOT_FOUND: 'errors.channelNotFound',
      NOT_LIVE: 'errors.notLive',
      CHAT_UNAVAILABLE: 'errors.chatUnavailable',
      SEND_FAILED: 'errors.sendFailed',
      NETWORK_ERROR: 'errors.network',
      AUTH_FAILED: 'errors.authFailed',
      UNKNOWN: 'errors.unknown'
    } as Record<AppError['code'], string>)[code]
    return error
  }
}

export function matchPendingEcho(
  pending: PendingEcho[],
  text: string,
  now = Date.now(),
  maxAgeMs = 45_000
): PendingEcho | undefined {
  for (let index = pending.length - 1; index >= 0; index--) {
    if (now - pending[index].at >= maxAgeMs) pending.splice(index, 1)
  }

  const index = pending.findIndex(
    (candidate) =>
      candidate.text === text && now - candidate.at < maxAgeMs
  )
  if (index < 0) return undefined
  return pending.splice(index, 1)[0]
}
