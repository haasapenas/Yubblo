import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../../../shared/types'

export type HighlightDraft = Pick<AppSettings, 'highlights' | 'highlightPreferences'>
export type SaveMode = 'immediate' | 'debounced'

export interface HighlightAutosaveState {
  draft: HighlightDraft
  saving: boolean
}

export interface HighlightAutosaveController {
  getState(): HighlightAutosaveState
  update(next: HighlightDraft, mode: SaveMode): void
  replaceSaved(next: HighlightDraft): void
  flush(): Promise<void>
  subscribe(listener: (state: HighlightAutosaveState) => void): () => void
  dispose(): void
}

export interface HighlightAutosave extends HighlightAutosaveState {
  update(next: HighlightDraft, mode: SaveMode): void
  flush(): Promise<void>
}

export function createHighlightAutosaveController(
  initial: HighlightDraft,
  save: (draft: HighlightDraft) => Promise<HighlightDraft>,
  onError: (error: unknown) => void = () => undefined,
  debounceMs = 300
): HighlightAutosaveController {
  let state: HighlightAutosaveState = { draft: initial, saving: false }
  let lastSaved = initial
  let queued: HighlightDraft | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> | null = null
  const listeners = new Set<(value: HighlightAutosaveState) => void>()

  function publish(next: HighlightAutosaveState): void {
    state = next
    for (const listener of listeners) listener(state)
  }

  function clearTimer(): void {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function persist(): Promise<void> {
    if (running) return running
    running = (async () => {
      publish({ ...state, saving: true })
      while (queued) {
        const snapshot = queued
        queued = null
        try {
          const saved = await save(snapshot)
          lastSaved = saved
          if (!queued) publish({ draft: saved, saving: true })
        } catch (error) {
          queued = null
          publish({ draft: lastSaved, saving: true })
          onError(error)
          break
        }
      }
      publish({ ...state, saving: false })
      running = null
    })()
    return running
  }

  return {
    getState: () => state,
    update(next, mode) {
      queued = next
      publish({ draft: next, saving: state.saving })
      clearTimer()
      if (mode === 'immediate') {
        void persist()
      } else {
        timer = setTimeout(() => {
          timer = null
          void persist()
        }, debounceMs)
      }
    },
    replaceSaved(next) {
      if (state.saving || queued) return
      lastSaved = next
      publish({ draft: next, saving: false })
    },
    async flush() {
      clearTimer()
      if (queued) void persist()
      if (running) await running
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      clearTimer()
      listeners.clear()
    }
  }
}

export function useHighlightAutosave(
  initial: HighlightDraft,
  save: (draft: HighlightDraft) => Promise<HighlightDraft>,
  onError?: (error: unknown) => void
): HighlightAutosave {
  const controllerRef = useRef<HighlightAutosaveController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createHighlightAutosaveController(initial, save, onError)
  }
  const controller = controllerRef.current
  const [state, setState] = useState(controller.getState())

  useEffect(() => controller.subscribe(setState), [controller])
  useEffect(() => {
    controller.replaceSaved(initial)
  }, [controller, initial])
  useEffect(() => () => {
    void controller.flush()
    controller.dispose()
  }, [controller])

  return {
    ...state,
    update: controller.update,
    flush: controller.flush
  }
}
