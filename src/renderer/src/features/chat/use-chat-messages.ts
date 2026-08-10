import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import type { ChatMessage } from '../../../../shared/types'
import type { ChatAuthor } from './composer/Composer'
import { executeChatInput } from './local-chat-command'
import { i18n } from '../../i18n/i18n-renderer'
import { mergeChatMessage } from './message-merge'
import { retainChatMessages } from './message-retention'

const MESSAGE_BATCH_MS = 100

export interface RemovedEvent {
  messageId?: string
  authorChannelId?: string
  videoId?: string
  restored?: boolean
  heldDismissed?: boolean
}

export interface UseChatMessagesResult {
  messagesByChannel: Record<string, ChatMessage[]>
  setMessagesByChannel: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>
  messages: ChatMessage[]
  patchMessages(
    videoId: string | undefined | null,
    updater: (messages: ChatMessage[]) => ChatMessage[]
  ): void
  dropMessages(videoId: string): void
  setRetentionPaused(videoId: string, paused: boolean): void
  clearAll(): void
  getAuthors(): ChatAuthor[]
  send(text: string): Promise<void>
}

export function applyRemovedEvent(messages: ChatMessage[], payload: RemovedEvent): ChatMessage[] {
  if (payload.restored && payload.authorChannelId) {
    return messages.map((message) => (
      message.authorChannelId === payload.authorChannelId
        ? { ...message, removed: false, pending: false }
        : message
    ))
  }
  if (payload.messageId) {
    const existing = messages.find((message) => message.id === payload.messageId)
    if (existing?.heldForReview || payload.heldDismissed) {
      return messages.filter((message) => message.id !== payload.messageId)
    }
    return messages.map((message) => (
      message.id === payload.messageId
        ? {
            ...message,
            removed: true,
            text: message.text || i18n.t('removedFallback', { ns: 'chat' }),
            pending: false
          }
        : message
    ))
  }
  if (payload.authorChannelId) {
    return messages.map((message) => (
      message.authorChannelId === payload.authorChannelId
        ? { ...message, removed: true, pending: false }
        : message
    ))
  }
  return messages
}

export function useChatMessages(
  apiReady: boolean,
  activeVideoId: string | null
): UseChatMessagesResult {
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, ChatMessage[]>>({})
  const activeRef = useRef<string | null>(activeVideoId)
  const authorsRef = useRef(new Map<string, ChatAuthor>())
  const retentionPausedRef = useRef(new Set<string>())

  const rememberAuthor = useCallback((message: ChatMessage): void => {
    if (!message.authorName || message.removed || message.pending) return
    const name = message.authorName.trim()
    if (!name || name === 'Você') return
    const key = (message.authorChannelId || name).toLocaleLowerCase()
    const previous = authorsRef.current.get(key)
    authorsRef.current.set(key, {
      key,
      name,
      channelId: message.authorChannelId || previous?.channelId,
      lastSeen: Date.now()
    })
    if (authorsRef.current.size > 400) {
      const sorted = [...authorsRef.current.values()].sort((a, b) => a.lastSeen - b.lastSeen)
      for (let index = 0; index < 80; index++) {
        authorsRef.current.delete(sorted[index]!.key)
      }
    }
  }, [])

  const patchMessages = useCallback((
    videoId: string | undefined | null,
    updater: (messages: ChatMessage[]) => ChatMessage[]
  ): void => {
    if (!videoId) return
    setMessagesByChannel((all) => ({
      ...all,
      [videoId]: updater(all[videoId] || [])
    }))
  }, [])

  const dropMessages = useCallback((videoId: string): void => {
    setMessagesByChannel((all) => {
      const copy = { ...all }
      delete copy[videoId]
      return copy
    })
  }, [])

  const setRetentionPaused = useCallback((videoId: string, paused: boolean): void => {
    if (paused) {
      retentionPausedRef.current.add(videoId)
      return
    }
    retentionPausedRef.current.delete(videoId)
    patchMessages(videoId, (messages) => retainChatMessages(messages, false))
  }, [patchMessages])

  useEffect(() => {
    activeRef.current = activeVideoId
    authorsRef.current.clear()
    for (const message of activeVideoId ? messagesByChannel[activeVideoId] || [] : []) {
      rememberAuthor(message)
    }
  }, [activeVideoId])

  useEffect(() => {
    if (!apiReady || !window.yubblo) return
    const queue: Array<ChatMessage & { videoId: string }> = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flush = (): void => {
      flushTimer = null
      if (!queue.length) return
      const batch = queue.splice(0, queue.length)
      for (const message of batch) {
        if (message.videoId === activeRef.current) rememberAuthor(message)
      }
      setMessagesByChannel((all) => {
        const next = { ...all }
        const buckets = new Map<string, ChatMessage[]>()
        for (const message of batch) {
          const list = buckets.get(message.videoId) || next[message.videoId] || []
          buckets.set(
            message.videoId,
            mergeChatMessage(
              list,
              message,
              retentionPausedRef.current.has(message.videoId)
            )
          )
        }
        for (const [videoId, list] of buckets) next[videoId] = list
        return next
      })
    }
    const offMessage = window.yubblo.chat.onMessage((message) => {
      const videoId = message.videoId
      if (!videoId) return
      queue.push({ ...message, videoId })
      if (message.isSelf || message.failed || message.pending || message.awaitingEcho) {
        if (flushTimer) clearTimeout(flushTimer)
        flush()
      } else if (!flushTimer) {
        flushTimer = setTimeout(flush, MESSAGE_BATCH_MS)
      }
    })
    const offRemoved = window.yubblo.chat.onRemoved((payload) => {
      const videoId = payload.videoId || activeRef.current
      if (payload.heldDismissed && payload.messageId) {
        setMessagesByChannel((all) => {
          const next = { ...all }
          const keys = videoId && next[videoId] ? [videoId] : Object.keys(next)
          for (const key of keys) next[key] = applyRemovedEvent(next[key] || [], payload)
          return next
        })
        return
      }
      if (videoId) patchMessages(videoId, (messages) => applyRemovedEvent(messages, payload))
    })
    return () => {
      if (flushTimer) clearTimeout(flushTimer)
      flush()
      offMessage()
      offRemoved()
    }
  }, [apiReady, patchMessages, rememberAuthor])

  const send = useCallback(async (text: string): Promise<void> => {
    if (!window.yubblo) throw new Error('Preload ausente')
    const videoId = activeRef.current
    const result = await executeChatInput(text, {
      videoId,
      authors: [...authorsRef.current.values()],
      clear: (id) => window.yubblo.chat.clear(id),
      openUser: (input) => window.yubblo.chat.openChannelActivityByHandle(input),
      send: (value) => window.yubblo.chat.send(value)
    })
    if (videoId && result.clearCutoff !== undefined) {
      const cutoff = result.clearCutoff
      patchMessages(videoId, (messages) => (
        messages.filter((message) => message.timestamp > cutoff)
      ))
      if (activeRef.current === videoId) authorsRef.current.clear()
    }
  }, [patchMessages])

  return {
    messagesByChannel,
    setMessagesByChannel,
    messages: activeVideoId ? messagesByChannel[activeVideoId] || [] : [],
    patchMessages,
    dropMessages,
    setRetentionPaused,
    clearAll: () => setMessagesByChannel({}),
    getAuthors: () => [...authorsRef.current.values()],
    send
  }
}
