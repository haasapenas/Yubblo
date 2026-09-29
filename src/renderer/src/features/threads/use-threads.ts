import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, ChatMessage } from '../../../../shared/types'
import {
  buildThreadIndex,
  collectThread,
  EMPTY_THREAD_INDEX,
  normalizeThreadName,
  type ThreadLink
} from './thread-index'

const LOCAL_TARGETS_MAX = 50

export interface UseThreadsResult {
  enabled: boolean
  links: ReadonlyMap<string, ThreadLink>
  threadIds: ReadonlySet<string>
  openThread(messageId: string): void
  closeThread(): void
  rememberReplyTarget(message: ChatMessage): void
}

export function useThreads(
  apiReady: boolean,
  activeVideoId: string | null,
  messages: readonly ChatMessage[]
): UseThreadsResult {
  const [enabled, setEnabled] = useState(false)
  const [openRootId, setOpenRootId] = useState<string | null>(null)
  const localTargetsRef = useRef(new Map<string, string>())

  useEffect(() => {
    if (!apiReady || !window.yubblo) return
    const apply = (settings: AppSettings): void => setEnabled(settings.chatThreads === true)
    void window.yubblo.settings.get().then(apply).catch(() => undefined)
    return window.yubblo.settings.onChanged(apply)
  }, [apiReady])

  useEffect(() => {
    setOpenRootId(null)
    localTargetsRef.current.clear()
  }, [activeVideoId])

  useEffect(() => {
    if (!enabled) setOpenRootId(null)
  }, [enabled])

  const index = useMemo(
    () => enabled ? buildThreadIndex(messages, localTargetsRef.current) : EMPTY_THREAD_INDEX,
    [enabled, messages]
  )

  const threadIds = useMemo<ReadonlySet<string>>(
    () => new Set(
      openRootId ? collectThread(messages, index, openRootId).map((message) => message.id) : []
    ),
    [messages, index, openRootId]
  )

  const indexRef = useRef(index)
  indexRef.current = index
  const openThread = useCallback((messageId: string): void => {
    setOpenRootId(indexRef.current.links.get(messageId)?.rootId ?? messageId)
  }, [])

  const closeThread = useCallback((): void => setOpenRootId(null), [])

  const rememberReplyTarget = useCallback((message: ChatMessage): void => {
    const name = normalizeThreadName(message.authorName)
    if (!name) return
    const targets = localTargetsRef.current
    targets.delete(name)
    targets.set(name, message.id)
    if (targets.size > LOCAL_TARGETS_MAX) {
      const oldest = targets.keys().next().value
      if (oldest) targets.delete(oldest)
    }
  }, [])

  return {
    enabled,
    links: index.links,
    threadIds,
    openThread,
    closeThread,
    rememberReplyTarget
  }
}
