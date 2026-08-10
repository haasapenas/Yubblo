import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction
} from 'react'
import type {
  AppError,
  ChatActionButton,
  ChatMessage,
  LiveSessionInfo,
  ModMenuAction,
  ModMenuResult
} from '../../../../shared/types'
import { i18n } from '../../i18n/i18n-renderer'
import { parseIpcError } from '../../shared/format'
import {
  expandCommandTemplate,
  canUseMessageMenu,
  isTimeDurationLabel,
  matchTimeoutIconType,
  placeMenuFromPoint,
  topLevelActions
} from './moderation-ui'
import type { ModerationMenuState } from './ModerationMenu'

export interface HiddenUser {
  channelId: string
  name: string
  canUnhide: boolean
}

export interface UseModerationOptions {
  apiReady: boolean
  activeVideoId: string | null
  canModerate: boolean
  session: LiveSessionInfo | null
  patchMessages(
    videoId: string | undefined | null,
    update: (messages: ChatMessage[]) => ChatMessage[]
  ): void
  setMessagesByChannel: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>
  setError(error: AppError | null): void
}

export interface UseModerationResult {
  actionBusyIds: ReadonlySet<string>
  hiddenUsers: HiddenUser[]
  menu: ModerationMenuState | null
  menuBusy: boolean
  closeMenu(): void
  backMenu(): void
  reset(): void
  runHeldAction(message: ChatMessage, iconType: string): Promise<void>
  runQuickAction(button: ChatActionButton, message: ChatMessage): Promise<void>
  warmMenu(messageId: string): void
  openMenu(message: ChatMessage, event: MouseEvent): Promise<void>
  runMenuAction(action: ModMenuAction): Promise<void>
  unhideUser(channelId: string): Promise<void>
  removeBan(channelId: string, systemMessageId: string): Promise<void>
}

function menuPosition(
  event: MouseEvent,
  estimatedHeight = 160
): { x: number; y: number } {
  const width = 220
  const padding = 8
  const element = event.currentTarget as HTMLElement
  const rect = element?.getBoundingClientRect?.()
  let x = rect ? rect.right - width : event.clientX
  let y = rect ? rect.bottom + 4 : event.clientY
  if (x < padding) x = padding
  if (x + width > window.innerWidth - padding) {
    x = window.innerWidth - width - padding
  }
  if (y + estimatedHeight > window.innerHeight - padding) {
    y = (rect ? rect.top : event.clientY) - estimatedHeight - 4
  }
  if (y < padding) y = padding
  return { x, y }
}

export function useModeration({
  apiReady,
  activeVideoId,
  canModerate,
  session,
  patchMessages,
  setMessagesByChannel,
  setError
}: UseModerationOptions): UseModerationResult {
  const [actionBusyIds, setActionBusyIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const busyActionsRef = useRef(new Set<string>())
  const beginAction = useCallback((key: string, scope = key): boolean => {
    for (const pending of busyActionsRef.current) {
      if (pending.startsWith(scope)) return false
    }
    busyActionsRef.current.add(key)
    setActionBusyIds(new Set(busyActionsRef.current))
    return true
  }, [])
  const endAction = useCallback((key: string): void => {
    busyActionsRef.current.delete(key)
    setActionBusyIds(new Set(busyActionsRef.current))
  }, [])
  const [hiddenUsers, setHiddenUsers] = useState<HiddenUser[]>([])
  const [menu, setMenu] = useState<ModerationMenuState | null>(null)
  const [menuBusy, setMenuBusy] = useState(false)
  const cacheRef = useRef(new Map<string, ModMenuResult>())
  const activeRef = useRef(activeVideoId)
  const optionsRef = useRef({
    canModerate,
    session,
    patchMessages,
    setMessagesByChannel,
    setError
  })
  optionsRef.current = {
    canModerate,
    session,
    patchMessages,
    setMessagesByChannel,
    setError
  }

  useEffect(() => {
    activeRef.current = activeVideoId
    cacheRef.current.clear()
    setMenu(null)
  }, [activeVideoId])

  useEffect(() => {
    if (!apiReady || !window.yubblo) return
    const offReady = window.yubblo.chat.onModMenuReady((result) => {
      cacheRef.current.set(result.messageId, result)
    })
    const offHidden = window.yubblo.chat.onHiddenUsersChanged(setHiddenUsers)
    void window.yubblo.chat.listHiddenUsers().then(setHiddenUsers).catch(() => {})
    return () => {
      offReady()
      offHidden()
    }
  }, [apiReady])

  const runHeldAction = useCallback(async (
    message: ChatMessage,
    iconType: string
  ): Promise<void> => {
    const videoId = activeRef.current
    if (!window.yubblo || !videoId || !message.heldForReview) return
    const busyKey = `message:${message.id}:held:${iconType}`
    if (!beginAction(busyKey, `message:${message.id}:`)) return
    optionsRef.current.setError(null)
    try {
      await window.yubblo.chat.runModAction(message.id, iconType, videoId)
      const hide =
        message.heldActions?.find((action) => action.iconType === iconType)?.action === 'hide' ||
        iconType === 'AUTOMOD_HIDE' ||
        iconType.startsWith('AUTOMOD_HIDE')
      if (hide) {
        optionsRef.current.setMessagesByChannel((all) => {
          const next = { ...all }
          for (const key of Object.keys(next)) {
            next[key] = (next[key] || []).filter((item) => item.id !== message.id)
          }
          return next
        })
      }
    } catch (error) {
      optionsRef.current.setError(parseIpcError(error))
    } finally {
      endAction(busyKey)
    }
  }, [beginAction, endAction])

  const runQuickAction = useCallback(async (
    button: ChatActionButton,
    message: ChatMessage
  ): Promise<void> => {
    const videoId = activeRef.current
    if (!window.yubblo || !videoId || message.pending || message.removed || message.failed) {
      return
    }
    if (message.id.startsWith('local-') && button.kind !== 'command') return
    if (button.kind !== 'command' && !optionsRef.current.canModerate) return

    const busyKey = `message:${message.id}:quick:${button.id}`
    if (!beginAction(busyKey, `message:${message.id}:`)) return
    optionsRef.current.setError(null)
    try {
      if (button.kind === 'command') {
        const currentSession = optionsRef.current.session
        const text = expandCommandTemplate(button.command || '', {
          authorName: message.authorName,
          channelHandle: currentSession?.channelHandle,
          channelName: currentSession?.channelName,
          messageText: message.text || ''
        }).trim()
        if (!text) {
          optionsRef.current.setError({
            code: 'UNKNOWN',
            message: i18n.t('errors.emptyCommand', { ns: 'moderation' })
          })
          return
        }
        await window.yubblo.chat.send(text)
        return
      }

      let result = cacheRef.current.get(message.id)
      if (!result) {
        result = await window.yubblo.chat.getModMenu(message.id, videoId)
        cacheRef.current.set(message.id, result)
      }
      if (!result.canModerate) {
        optionsRef.current.setError({
          code: 'UNKNOWN',
          message: i18n.t('errors.noPermission', { ns: 'moderation' })
        })
        return
      }

      if (button.kind === 'timeout') {
        const key = button.timeoutKey || ''
        let durations = (result.timeoutDurations || []).filter((action) =>
          isTimeDurationLabel(action.label)
        )
        if (!durations.length) {
          const response = await window.yubblo.chat.runModAction(
            message.id,
            'TIMEOUT_MENU',
            videoId
          )
          const picker =
            response && typeof response === 'object' && 'needDurationPicker' in response
              ? response.needDurationPicker
              : undefined
          if (picker) {
            durations = (picker.timeoutDurations || picker.actions).filter((action) =>
              isTimeDurationLabel(action.label)
            )
            cacheRef.current.set(message.id, {
              ...result,
              ...picker,
              timeoutDurations: durations,
              actions: result.actions
            })
          }
        }
        const iconType = matchTimeoutIconType(durations, key)
        if (!iconType) {
          optionsRef.current.setError({
            code: 'UNKNOWN',
            message: i18n.t('errors.durationUnavailable', { ns: 'moderation',
              duration: key,
              options: durations.map((action) => action.label).join(', ') || i18n.t('errors.noOptions', { ns: 'moderation' })
            })
          })
          return
        }
        await window.yubblo.chat.runModAction(message.id, iconType, videoId)
        return
      }

      const action = result.actions.find((candidate) => candidate.kind === button.kind)
      if (action) {
        await window.yubblo.chat.runModAction(message.id, action.iconType, videoId)
        return
      }
      if (button.kind === 'unhide' && message.authorChannelId) {
        await window.yubblo.chat.unhideUser(message.authorChannelId)
        return
      }
      optionsRef.current.setError({
        code: 'UNKNOWN',
        message:
          button.kind === 'delete'
            ? i18n.t('errors.deleteUnavailable', { ns: 'moderation' })
            : button.kind === 'hide'
              ? i18n.t('errors.hideUnavailable', { ns: 'moderation' })
              : i18n.t('errors.unhideUnavailable', { ns: 'moderation' })
      })
    } catch (error) {
      optionsRef.current.setError(parseIpcError(error))
    } finally {
      endAction(busyKey)
    }
  }, [beginAction, endAction])

  const warmMenu = useCallback((messageId: string): void => {
    const videoId = activeRef.current
    if (!window.yubblo || !videoId || !messageId || messageId.startsWith('local-')) return
    if (cacheRef.current.has(messageId)) return
    void window.yubblo.chat.prefetchModMenu(messageId, videoId)
  }, [])

  const openMenu = useCallback(async (
    message: ChatMessage,
    event: MouseEvent
  ): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()
    const videoId = activeRef.current
    if (!window.yubblo || !videoId || message.pending || message.failed) return
    if (message.id.startsWith('local-') && !message.hasContextMenu) return
    optionsRef.current.setError(null)

    const show = (result: ModMenuResult): void => {
      const actions = topLevelActions(result)
      if (!canUseMessageMenu(result, message)) {
        setMenu(null)
        optionsRef.current.setError({
          code: 'UNKNOWN',
          message: i18n.t('errors.noActions', { ns: 'moderation' })
        })
        return
      }
      setMenu({
        messageId: message.id,
        videoId,
        actions,
        durationMode: false,
        loading: false,
        channelActivityTarget: result.channelActivityAvailable && message.authorChannelId ? {
          videoId,
          messageId: message.id,
          authorChannelId: message.authorChannelId,
          authorName: message.authorName
        } : undefined,
        ...menuPosition(event, 48 + actions.length * 40)
      })
    }

    const cached = cacheRef.current.get(message.id)
    if (cached) {
      show(cached)
      return
    }
    setMenu({
      messageId: message.id,
      videoId,
      actions: [],
      durationMode: false,
      loading: true,
      ...menuPosition(event, 150)
    })
    try {
      const result = await window.yubblo.chat.getModMenu(message.id, videoId)
      cacheRef.current.set(message.id, result)
      show(result)
    } catch (error) {
      setMenu(null)
      optionsRef.current.setError(parseIpcError(error))
    }
  }, [])

  const showDurationPicker = useCallback((
    current: ModerationMenuState,
    picker: ModMenuResult
  ): void => {
    const previous = cacheRef.current.get(current.messageId)
    cacheRef.current.set(current.messageId, {
      ...(previous || picker),
      ...picker,
      timeoutDurations: picker.timeoutDurations || picker.actions,
      actions: previous?.actions || topLevelActions(picker)
    })
    const durations = (picker.timeoutDurations || picker.actions).filter((action) =>
      isTimeDurationLabel(action.label)
    )
    setMenu({
      messageId: picker.messageId,
      videoId: current.videoId,
      actions: durations,
      durationMode: true,
      loading: false,
      ...placeMenuFromPoint(
        current.x,
        current.y,
        { width: window.innerWidth, height: window.innerHeight },
        48 + durations.length * 36
      )
    })
  }, [])

  const runMenuAction = useCallback(async (action: ModMenuAction): Promise<void> => {
    if (!window.yubblo || !menu) return
    optionsRef.current.setError(null)
    const current = menu
    const timeoutRoot =
      action.kind === 'timeout' &&
      action.iconType === 'TIMEOUT_MENU' &&
      !current.durationMode

    if (timeoutRoot) {
      const cached = cacheRef.current.get(current.messageId)
      const durations = (cached?.timeoutDurations || []).filter((candidate) =>
        isTimeDurationLabel(candidate.label)
      )
      if (durations.length) {
        setMenu({
          ...current,
          actions: durations,
          durationMode: true,
          loading: false,
          ...placeMenuFromPoint(
            current.x,
            current.y,
            { width: window.innerWidth, height: window.innerHeight },
            48 + durations.length * 36
          )
        })
        return
      }
      setMenuBusy(true)
      try {
        const response = await window.yubblo.chat.runModAction(
          current.messageId,
          action.iconType,
          current.videoId
        )
        const picker =
          response && typeof response === 'object' && 'needDurationPicker' in response
            ? response.needDurationPicker
            : undefined
        if (picker) showDurationPicker(current, picker)
        else setMenu(null)
      } catch (error) {
        optionsRef.current.setError(parseIpcError(error))
        setMenu(null)
      } finally {
        setMenuBusy(false)
      }
      return
    }

    setMenu(null)
    setMenuBusy(false)
    try {
      const response = await window.yubblo.chat.runModAction(
        current.messageId,
        action.iconType,
        current.videoId
      )
      const picker =
        response && typeof response === 'object' && 'needDurationPicker' in response
          ? response.needDurationPicker
          : undefined
      if (picker) showDurationPicker(current, picker)
    } catch (error) {
      optionsRef.current.setError(parseIpcError(error))
    }
  }, [menu, showDurationPicker])

  const unhideUser = useCallback(async (channelId: string): Promise<void> => {
    if (!window.yubblo) return
    optionsRef.current.setError(null)
    try {
      await window.yubblo.chat.unhideUser(channelId)
      setHiddenUsers(await window.yubblo.chat.listHiddenUsers())
    } catch (error) {
      optionsRef.current.setError(parseIpcError(error))
    }
  }, [])

  const removeBan = useCallback(async (
    channelId: string,
    systemMessageId: string
  ): Promise<void> => {
    if (!window.yubblo) return
    const busyKey = `unban:${channelId}`
    if (!beginAction(busyKey)) return
    optionsRef.current.setError(null)
    try {
      await window.yubblo.chat.unhideUser(channelId)
      setHiddenUsers(await window.yubblo.chat.listHiddenUsers())
      optionsRef.current.patchMessages(activeRef.current, (messages) =>
        messages.map((message) =>
          message.id === systemMessageId
            ? { ...message, systemKind: 'mod-unhide' as const }
            : message
        )
      )
    } catch (error) {
      optionsRef.current.setError(parseIpcError(error))
    } finally {
      endAction(busyKey)
    }
  }, [beginAction, endAction])

  const backMenu = useCallback((): void => {
    if (!menu) return
    const cached = cacheRef.current.get(menu.messageId)
    if (!cached) {
      setMenu(null)
      return
    }
    setMenu({
      ...menu,
      actions: topLevelActions(cached),
      durationMode: false,
      loading: false
    })
  }, [menu])

  const reset = useCallback((): void => {
    cacheRef.current.clear()
    setMenu(null)
    setMenuBusy(false)
    busyActionsRef.current.clear()
    setActionBusyIds(new Set())
  }, [])

  return {
    actionBusyIds,
    hiddenUsers,
    menu,
    menuBusy,
    closeMenu: () => setMenu(null),
    backMenu,
    reset,
    runHeldAction,
    runQuickAction,
    warmMenu,
    openMenu,
    runMenuAction,
    unhideUser,
    removeBan
  }
}
