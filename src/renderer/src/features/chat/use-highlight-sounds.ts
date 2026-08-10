import { useEffect, useRef } from 'react'
import type {
  ChatMessage,
  HighlightPreferences,
  HighlightRule
} from '../../../../shared/types'
import { findHighlight, type SelfHighlightInput } from '../settings/highlights'

export interface HighlightSoundBatch {
  videoId: string | null
  messages: ChatMessage[]
  rules: HighlightRule[]
  preferences: HighlightPreferences
  activeIdentity?: SelfHighlightInput
  focused?: boolean
}

export interface HighlightSoundTracker {
  process(batch: HighlightSoundBatch): Promise<void>
  reset(videoId?: string): void
}

export function createHighlightSoundTracker(
  play: (path?: string) => Promise<void>
): HighlightSoundTracker {
  const seenByVideo = new Map<string, {
    ids: Set<string>
    startedAt: number
    recentSounds: Map<string, number>
  }>()

  return {
    async process(batch) {
      const videoId = batch.videoId
      if (!videoId) return
      let seen = seenByVideo.get(videoId)
      if (!seen) {
        seen = {
          ids: new Set(batch.messages.map((message) => message.id)),
          startedAt: Date.now(),
          recentSounds: new Map()
        }
        seenByVideo.set(videoId, seen)
        return
      }

      for (const message of batch.messages) {
        if (seen.ids.has(message.id)) continue
        seen.ids.add(message.id)
        if (message.timestamp < seen.startedAt - 2000) continue
        if (
          message.removed ||
          message.systemKind ||
          message.pending ||
          message.awaitingEcho ||
          message.failed ||
          message.id.startsWith('local-')
        ) continue

        const match = findHighlight(message, batch.rules, batch.activeIdentity)
        if (!match) continue
        const soundKey = (message.authorChannelId || message.authorName) + '\u0000' + (message.text || '')
        const now = Date.now()
        const previousSoundAt = seen.recentSounds.get(soundKey)
        if (previousSoundAt !== undefined && now - previousSoundAt < 1500) continue
        seen.recentSounds.set(soundKey, now)
        if (match.id === 'self') {
          if (!batch.preferences.selfPlaySound) continue
          await play(batch.preferences.selfSoundPath || batch.preferences.defaultSoundPath)
        } else {
          if (!match.playSound) continue
          await play(match.soundPath || batch.preferences.defaultSoundPath)
        }
      }

      const retained = batch.messages.slice(-2000).map((message) => message.id)
      const cutoff = Date.now() - 5000
      for (const [key, playedAt] of seen.recentSounds) {
        if (playedAt < cutoff) seen.recentSounds.delete(key)
      }
      seenByVideo.set(videoId, {
        ids: new Set(retained),
        startedAt: seen.startedAt,
        recentSounds: seen.recentSounds
      })
    },
    reset(videoId) {
      if (videoId) seenByVideo.delete(videoId)
      else seenByVideo.clear()
    }
  }
}

export interface UseHighlightSoundsInput extends Omit<HighlightSoundBatch, 'focused'> {
  play(path?: string): Promise<void>
}

export function useHighlightSounds(input: UseHighlightSoundsInput): void {
  const trackerRef = useRef<{
    play: UseHighlightSoundsInput['play']
    tracker: HighlightSoundTracker
  } | null>(null)
  if (!trackerRef.current || trackerRef.current.play !== input.play) {
    trackerRef.current = {
      play: input.play,
      tracker: createHighlightSoundTracker(input.play)
    }
  }

  useEffect(() => {
    void trackerRef.current!.tracker.process({
      videoId: input.videoId,
      messages: input.messages,
      rules: input.rules,
      preferences: input.preferences,
      activeIdentity: input.activeIdentity,
      focused: typeof document !== 'undefined' && document.hasFocus()
    })
  }, [input.videoId, input.messages, input.rules, input.preferences, input.activeIdentity])
}
