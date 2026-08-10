import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppError,
  LivePinnedMessage,
  LivePollState
} from '../../../../shared/types'
import { LIVE_POLLS_ENABLED } from '../../../../shared/feature-flags'
import { parseIpcError } from '../../shared/format'

export interface UseLiveStateResult {
  poll: LivePollState | null
  pollVoteBusy: string | null
  pinnedMessage: LivePinnedMessage | null
  vote(optionId: string): Promise<void>
  dismissPoll(): Promise<void>
  dismissPin(): Promise<void>
  reset(): void
}

export function useLiveState(
  apiReady: boolean,
  activeVideoId: string | null,
  setError: (error: AppError | null) => void
): UseLiveStateResult {
  const [poll, setPoll] = useState<LivePollState | null>(null)
  const [pollVoteBusy, setPollVoteBusy] = useState<string | null>(null)
  const [pinnedMessage, setPinnedMessage] = useState<LivePinnedMessage | null>(null)
  const activeRef = useRef(activeVideoId)

  useEffect(() => {
    activeRef.current = activeVideoId
    setPoll(null)
    setPinnedMessage(null)
    if (!apiReady || !window.yubblo || !activeVideoId) return
    const wanted = activeVideoId
    if (LIVE_POLLS_ENABLED) {
      void window.yubblo.chat.getLivePoll(wanted).then((next) => {
        if (activeRef.current === wanted) setPoll(next)
      })
    }
    void window.yubblo.chat.getPinnedMessage(wanted).then((next) => {
      if (activeRef.current === wanted) setPinnedMessage(next)
    })
  }, [activeVideoId, apiReady])

  useEffect(() => {
    if (!apiReady || !window.yubblo) return
    const offPoll = LIVE_POLLS_ENABLED
      ? window.yubblo.chat.onLivePoll((next) => {
          if (!next) {
            setPoll((previous) =>
              !previous || previous.videoId === activeRef.current ? null : previous
            )
          } else if (!next.videoId || next.videoId === activeRef.current) {
            setPoll(next)
          }
        })
      : () => undefined
    const offPin = window.yubblo.chat.onPinnedMessage((next) => {
      if (!next) {
        setPinnedMessage((previous) =>
          !previous || previous.videoId === activeRef.current ? null : previous
        )
      } else if (!next.videoId || next.videoId === activeRef.current) {
        setPinnedMessage(next)
      }
    })
    return () => {
      offPoll()
      offPin()
    }
  }, [apiReady])

  const vote = useCallback(async (optionId: string): Promise<void> => {
    if (!LIVE_POLLS_ENABLED || !window.yubblo || !poll || pollVoteBusy) return
    if (poll.selectedOptionId || poll.closed) return
    setPollVoteBusy(optionId)
    setError(null)
    try {
      const next = await window.yubblo.chat.voteLivePoll(
        poll.pollId,
        optionId,
        poll.videoId || activeRef.current
      )
      if (next) setPoll(next)
    } catch (error) {
      setError(parseIpcError(error))
    } finally {
      setPollVoteBusy(null)
    }
  }, [poll, pollVoteBusy, setError])

  const dismissPoll = useCallback(async (): Promise<void> => {
    if (!LIVE_POLLS_ENABLED || !window.yubblo || !poll) return
    const pollId = poll.pollId
    const videoId = poll.videoId || activeRef.current
    setPoll(null)
    try {
      await window.yubblo.chat.dismissLivePoll(pollId, videoId)
    } catch {
      // A UI já foi atualizada.
    }
  }, [poll])

  const dismissPin = useCallback(async (): Promise<void> => {
    if (!window.yubblo || !pinnedMessage) return
    const pinId = pinnedMessage.id
    const videoId = pinnedMessage.videoId || activeRef.current
    setPinnedMessage(null)
    try {
      await window.yubblo.chat.dismissPinnedMessage(pinId, videoId)
    } catch {
      // A UI já foi atualizada.
    }
  }, [pinnedMessage])

  const reset = useCallback((): void => {
    setPoll(null)
    setPollVoteBusy(null)
    setPinnedMessage(null)
  }, [])

  return {
    poll,
    pollVoteBusy,
    pinnedMessage,
    vote,
    dismissPoll,
    dismissPin,
    reset
  }
}
