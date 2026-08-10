import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppError,
  ChannelTab,
  ChatStatus,
  LiveSessionInfo,
  LiveStreamOption
} from '../../../../shared/types'
import { parseIpcError } from '../../shared/format'
import { i18n } from '../../i18n/i18n-renderer'
import type { LivePickerState } from './LivePicker'

export interface UseChatSessionsOptions {
  apiReady: boolean
  onError(error: AppError | null): void
  onBeforeTransition?(): void
  onDropMessages?(videoId: string): void
}

export interface UseChatSessionsResult {
  tabs: ChannelTab[]
  activeVideoId: string | null
  session: LiveSessionInfo | null
  status: ChatStatus
  siblingLives: LiveStreamOption[]
  siblingOwnerKey: string | null
  picker: LivePickerState | null
  pickerBusyVideoId: string | null
  busyOpen: boolean
  openInput(input: string): Promise<boolean>
  pickLive(live: LiveStreamOption): Promise<void>
  select(videoId: string): Promise<void>
  close(videoId: string): Promise<void>
  openSiblingLivesPicker(): void
  closePicker(): void
  reset(): void
}

export function resolveActiveVideoId(
  previousVideoId: string | null,
  tabs: ChannelTab[],
  suggestedVideoId: string | null
): string | null {
  if (previousVideoId && tabs.some((tab) => tab.videoId === previousVideoId)) {
    return previousVideoId
  }
  if (previousVideoId?.startsWith('pending:')) {
    const oldKey = previousVideoId.slice('pending:'.length)
    const promoted = tabs.find((tab) => tab.tabKey === oldKey)
    if (promoted) return promoted.videoId
  }
  if (suggestedVideoId && tabs.some((tab) => tab.videoId === suggestedVideoId)) {
    return suggestedVideoId
  }
  return tabs[0]?.videoId || null
}

export function resolveActiveTabStatus(
  tabs: ChannelTab[],
  activeVideoId: string | null,
  fallback: ChatStatus
): ChatStatus {
  if (!tabs.length) return 'idle'
  return tabs.find((tab) => tab.videoId === activeVideoId)?.status || fallback
}

export function channelListKeyFromSession(info: LiveSessionInfo | null): string | null {
  if (!info) return null
  if (info.channelHandle) return `@${info.channelHandle.replace(/^@/, '')}`
  const raw = (info.input || '').trim()
  if (!raw || /^[a-zA-Z0-9_-]{11}$/.test(raw)) return null
  if (/youtu\.?be|watch\?v=|\/live\//i.test(raw) && /[?&]v=|youtu\.be\//i.test(raw)) {
    return null
  }
  return raw
}

export interface FastOpenMeta {
  sourceInput: string
  preferVideoTab: boolean
}

export async function openPrimaryChannel(
  input: string,
  open: (input: string, meta: FastOpenMeta) => Promise<void>
): Promise<void> {
  await open(input, { sourceInput: input, preferVideoTab: false })
}
export function useChatSessions({
  apiReady,
  onError,
  onBeforeTransition,
  onDropMessages
}: UseChatSessionsOptions): UseChatSessionsResult {
  const [tabs, setTabs] = useState<ChannelTab[]>([])
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [session, setSession] = useState<LiveSessionInfo | null>(null)
  const [status, setStatus] = useState<ChatStatus>('idle')
  const [siblingLives, setSiblingLives] = useState<LiveStreamOption[]>([])
  const [siblingOwnerKey, setSiblingOwnerKey] = useState<string | null>(null)
  const [picker, setPicker] = useState<LivePickerState | null>(null)
  const [pickerBusyVideoId, setPickerBusyVideoId] = useState<string | null>(null)
  const [busyOpen, setBusyOpen] = useState(false)
  const activeRef = useRef<string | null>(null)
  const siblingCacheRef = useRef(new Map<string, LiveStreamOption[]>())
  const callbacksRef = useRef({ onError, onBeforeTransition, onDropMessages })
  callbacksRef.current = { onError, onBeforeTransition, onDropMessages }

  const activate = useCallback((videoId: string | null): void => {
    activeRef.current = videoId
    setActiveVideoId(videoId)
  }, [])

  const rememberSiblingLives = useCallback((key: string | null | undefined, lives: LiveStreamOption[]): void => {
    if (!key) return
    const onlyLive = lives.filter((live) => live.isLive !== false)
    siblingCacheRef.current.set(key, onlyLive)
    setSiblingLives(onlyLive)
    setSiblingOwnerKey(key)
  }, [])

  const applyOpenedSession = useCallback((info: LiveSessionInfo): void => {
    setSession(info)
    activate(info.videoId)
    const offline = info.isLive === false || info.videoId.startsWith('pending:')
    setStatus(offline ? 'ended' : 'live')
    setPicker(null)
    setPickerBusyVideoId(null)
    const key = channelListKeyFromSession(info)
    const cached = key ? siblingCacheRef.current.get(key) : undefined
    if (cached) {
      setSiblingLives(cached)
      setSiblingOwnerKey(key)
    } else {
      setSiblingLives([])
      setSiblingOwnerKey(null)
    }
  }, [activate])

  const openLiveByInput = useCallback(async (
    input: string,
    meta?: {
      sourceInput?: string
      preferVideoTab?: boolean
      replaceVideoId?: string
      replaceSameChannel?: boolean
    }
  ): Promise<void> => {
    const info = await window.yubblo!.chat.openByChannel(input, {
      sourceInput: meta?.sourceInput,
      preferVideoTab: meta?.preferVideoTab ?? true,
      replaceVideoId: meta?.replaceVideoId,
      replaceSameChannel: meta?.replaceSameChannel
    })
    if (meta?.replaceVideoId && meta.replaceVideoId !== info.videoId) {
      callbacksRef.current.onDropMessages?.(meta.replaceVideoId)
    }
    applyOpenedSession(info)
  }, [applyOpenedSession])

  useEffect(() => {
    if (!apiReady || !window.yubblo) return
    const offStatus = window.yubblo.chat.onStatus(({ status: next, error, videoId }) => {
      if (!videoId || videoId === activeRef.current) {
        setStatus(next)
        if (error) callbacksRef.current.onError(error)
        else if (next === 'live' || next === 'connecting') callbacksRef.current.onError(null)
      }
      setTabs((current) => current.map((tab) => (
        tab.videoId === videoId ? { ...tab, status: next } : tab
      )))
    })
    const offSessions = window.yubblo.chat.onSessionsChanged(({ tabs: nextTabs, activeVideoId: suggested }) => {
      const next = resolveActiveVideoId(activeRef.current, nextTabs, suggested)
      setTabs(nextTabs)
      activate(next)
      setStatus((current) => resolveActiveTabStatus(nextTabs, next, current))
    })
    void window.yubblo.chat.listSessions()
      .then(({ tabs: nextTabs, activeVideoId: nextActive }) => {
        setTabs(nextTabs)
        activate(nextActive)
        setStatus((current) => resolveActiveTabStatus(nextTabs, nextActive, current))
        if (nextActive) {
          void window.yubblo!.chat.switchSession(nextActive).then((info) => {
            if (info && activeRef.current === nextActive) setSession(info)
          })
        }
      })
      .catch((error) => callbacksRef.current.onError(parseIpcError(error)))
    return () => {
      offStatus()
      offSessions()
    }
  }, [activate, apiReady])

  useEffect(() => {
    if (!apiReady || !window.yubblo || !activeVideoId) {
      if (!activeVideoId) setSession(null)
      return
    }
    let cancelled = false
    const wanted = activeVideoId
    void window.yubblo.chat.switchSession(wanted).then((info) => {
      if (cancelled || activeRef.current !== wanted || !info) return
      setSession((previous) => (
        previous?.videoId === info.videoId && previous.title === info.title ? previous : info
      ))
    })
    return () => { cancelled = true }
  }, [activeVideoId, apiReady])

  useEffect(() => {
    if (!apiReady || !window.yubblo || !session) {
      setSiblingLives([])
      setSiblingOwnerKey(null)
      return
    }
    const key = channelListKeyFromSession(session)
    if (!key) {
      setSiblingLives([])
      setSiblingOwnerKey(null)
      return
    }
    const cached = siblingCacheRef.current.get(key)
    setSiblingLives(cached || [])
    setSiblingOwnerKey(cached ? key : null)
    let cancelled = false
    const wantedVideoId = session.videoId
    void window.yubblo.chat.listChannelLives(key).then((listed) => {
      if (cancelled || activeRef.current !== wantedVideoId) return
      const lives = listed.directVideoId
        ? []
        : (listed.lives || []).filter((live) => live.isLive !== false)
      siblingCacheRef.current.set(key, lives)
      if (siblingCacheRef.current.size > 30) {
        const first = siblingCacheRef.current.keys().next().value
        if (first) siblingCacheRef.current.delete(first)
      }
      setSiblingLives(lives)
      setSiblingOwnerKey(key)
    }).catch(() => {
      if (cancelled || activeRef.current !== wantedVideoId) return
      setSiblingLives([])
      setSiblingOwnerKey(null)
    })
    return () => { cancelled = true }
  }, [apiReady, session?.videoId, session?.channelHandle, session?.input])

  const openInput = useCallback(async (input: string): Promise<boolean> => {
    if (!window.yubblo) return false
    const value = input.trim()
    if (!value) return false
    setBusyOpen(true)
    callbacksRef.current.onError(null)
    callbacksRef.current.onBeforeTransition?.()
    setPicker(null)
    try {
      setStatus('connecting')
      await openPrimaryChannel(value, openLiveByInput)
      return true
    } catch (error) {
      callbacksRef.current.onError(parseIpcError(error))
      setStatus('error')
      return false
    } finally {
      setBusyOpen(false)
    }
  }, [openLiveByInput])

  const pickLive = useCallback(async (live: LiveStreamOption): Promise<void> => {
    if (!window.yubblo || pickerBusyVideoId) return
    if (live.videoId === activeRef.current) {
      setPicker(null)
      return
    }
    setPickerBusyVideoId(live.videoId)
    callbacksRef.current.onError(null)
    callbacksRef.current.onBeforeTransition?.()
    setStatus('connecting')
    try {
      const source = picker?.input
      await openLiveByInput(live.videoId, {
        sourceInput: source,
        preferVideoTab: false,
        replaceVideoId: activeRef.current || undefined,
        replaceSameChannel: true
      })
      if (source && picker?.lives.length) rememberSiblingLives(source, picker.lives)
    } catch (error) {
      callbacksRef.current.onError(parseIpcError(error))
      setStatus('error')
    } finally {
      setPickerBusyVideoId(null)
    }
  }, [openLiveByInput, picker, pickerBusyVideoId, rememberSiblingLives])

  const select = useCallback(async (videoId: string): Promise<void> => {
    if (!window.yubblo || videoId === activeRef.current) return
    callbacksRef.current.onBeforeTransition?.()
    setPicker(null)
    activate(videoId)
    setSiblingLives([])
    setSiblingOwnerKey(null)
    try {
      const info = await window.yubblo.chat.switchSession(videoId)
      if (activeRef.current !== videoId || !info) return
      setSession(info)
      const cachedKey = channelListKeyFromSession(info)
      const cached = cachedKey ? siblingCacheRef.current.get(cachedKey) : undefined
      if (cached) {
        setSiblingLives(cached)
        setSiblingOwnerKey(cachedKey)
      }
      const tab = tabs.find((item) => item.videoId === videoId)
      const tabStatus = tab?.status
      setStatus(tabStatus === 'connecting' || tabStatus === 'ended' || tabStatus === 'error' ? tabStatus : 'live')
      callbacksRef.current.onError(null)
    } catch (error) {
      if (activeRef.current === videoId) callbacksRef.current.onError(parseIpcError(error))
    }
  }, [activate, tabs])

  const close = useCallback(async (videoId: string): Promise<void> => {
    if (!window.yubblo) return
    callbacksRef.current.onBeforeTransition?.()
    try {
      const next = await window.yubblo.chat.closeSession(videoId)
      callbacksRef.current.onDropMessages?.(videoId)
      if (next) {
        setSession(next)
        activate(next.videoId)
        setStatus('live')
      } else {
        setSession(null)
        activate(null)
        setStatus('idle')
      }
    } catch (error) {
      callbacksRef.current.onError(parseIpcError(error))
    }
  }, [activate])

  const openSiblingLivesPicker = useCallback((): void => {
    if (!session || siblingLives.length < 2) return
    const sessionKey = channelListKeyFromSession(session)
    if (sessionKey && siblingOwnerKey && siblingOwnerKey !== sessionKey) return
    setPicker({
      channelLabel: session.channelName || i18n.t('genericChannel', { ns: 'channels' }),
      input: siblingOwnerKey || sessionKey || session.input || '',
      lives: siblingLives
    })
  }, [session, siblingLives, siblingOwnerKey])

  const reset = useCallback((): void => {
    setTabs([])
    activate(null)
    setSession(null)
    setStatus('idle')
    setSiblingLives([])
    setSiblingOwnerKey(null)
    setPicker(null)
    setPickerBusyVideoId(null)
    setBusyOpen(false)
    siblingCacheRef.current.clear()
  }, [activate])

  return {
    tabs,
    activeVideoId,
    session,
    status,
    siblingLives,
    siblingOwnerKey,
    picker,
    pickerBusyVideoId,
    busyOpen,
    openInput,
    pickLive,
    select,
    close,
    openSiblingLivesPicker,
    closePicker: () => setPicker(null),
    reset
  }
}
