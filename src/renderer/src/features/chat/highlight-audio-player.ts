import type { HighlightSoundData } from '../../../../shared/types'

interface AudioEntry {
  url: string
  audio: HTMLAudioElement
}

export interface HighlightAudioPlayer {
  play(path?: string): Promise<void>
  dispose(): void
}

export interface HighlightAudioEnvironment {
  createAudio(src: string): HTMLAudioElement
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

export function createHighlightAudioPlayer(
  readSound: (path: string) => Promise<HighlightSoundData>,
  fallbackUrl: string,
  cacheLimit = 4,
  environment: HighlightAudioEnvironment = {
    createAudio: (src) => new Audio(src),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url)
  }
): HighlightAudioPlayer {
  const cache = new Map<string, AudioEntry>()
  const fallback = environment.createAudio(fallbackUrl)

  async function playAudio(audio: HTMLAudioElement): Promise<void> {
    audio.currentTime = 0
    try {
      await audio.play()
    } catch {
      // Browsers can reject autoplay; highlights must never break the chat.
    }
  }

  function evictOverflow(): void {
    while (cache.size > Math.max(1, cacheLimit)) {
      const oldestPath = cache.keys().next().value as string | undefined
      if (!oldestPath) return
      const entry = cache.get(oldestPath)
      cache.delete(oldestPath)
      if (entry) environment.revokeObjectURL(entry.url)
    }
  }

  return {
    async play(path) {
      if (!path) {
        await playAudio(fallback)
        return
      }
      let entry = cache.get(path)
      if (!entry) {
        try {
          const data = await readSound(path)
          const copy = new Uint8Array(data.bytes.byteLength)
          copy.set(data.bytes)
          const blob = new Blob([copy.buffer], { type: data.mimeType })
          const url = environment.createObjectURL(blob)
          entry = { url, audio: environment.createAudio(url) }
          cache.set(path, entry)
          evictOverflow()
        } catch {
          await playAudio(fallback)
          return
        }
      }
      await playAudio(entry.audio)
    },
    dispose() {
      for (const entry of cache.values()) {
        environment.revokeObjectURL(entry.url)
      }
      cache.clear()
    }
  }
}
