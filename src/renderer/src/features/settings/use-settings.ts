import { useEffect, useMemo, useState } from 'react'
import type { AppLocale } from '../../../../shared/i18n/locale'
import { DEFAULT_APP_LOCALE } from '../../../../shared/i18n/locale'
import type {
  AppError,
  AppSettings,
  ChatActionButton,
  HighlightPreferences,
  HighlightRule,
  MonitoredUser,
  MonitoringSettings
} from '../../../../shared/types'
import { parseIpcError } from '../../shared/format'
import { i18n } from '../../i18n/i18n-renderer'

export interface UseSettingsResult {
  locale: AppLocale
  chatFontSize: number
  pauseChatOnHover: boolean
  showFocusModeShortcut: boolean
  highlights: HighlightRule[]
  highlightPreferences: HighlightPreferences
  monitoring: MonitoringSettings
  actionButtons: ChatActionButton[]
  enabledActions: ChatActionButton[]
  busy: boolean
  saveHighlights(next: HighlightRule[]): Promise<void>
  saveHighlightPreferences(next: HighlightPreferences): Promise<void>
  saveMonitoring(next: MonitoringSettings): Promise<void>
  saveActionButtons(next: ChatActionButton[]): Promise<void>
  saveLocale(next: AppLocale): Promise<void>
  savePauseChatOnHover(next: boolean): Promise<void>
}

export function filterEnabledActions(
  buttons: ChatActionButton[]
): ChatActionButton[] {
  return buttons.filter((button) => button.enabled)
}

export function toggleMonitoredUser(
  monitoring: MonitoringSettings,
  user: MonitoredUser
): MonitoringSettings {
  if (!user.channelId) return monitoring
  const exists = monitoring.users.some((item) => item.channelId === user.channelId)
  return {
    ...monitoring,
    users: exists
      ? monitoring.users.filter((item) => item.channelId !== user.channelId)
      : [...monitoring.users, user]
  }
}

export function useSettings(
  apiReady: boolean,
  onError: (error: AppError) => void
): UseSettingsResult {
  const [highlights, setHighlights] = useState<HighlightRule[]>([])
  const [highlightPreferences, setHighlightPreferences] = useState<HighlightPreferences>({
    selfEnabled: true,
    selfColor: '#f5a524',
    selfPlaySound: false,
    playSoundWhileFocused: false
  })
  const [monitoring, setMonitoring] = useState<MonitoringSettings>({
    users: [],
    color: '#58249ccc'
  })
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_APP_LOCALE)
  const [chatFontSize, setChatFontSize] = useState(13)
  const [pauseChatOnHover, setPauseChatOnHoverState] = useState(false)
  const [showFocusModeShortcut, setShowFocusModeShortcut] = useState(false)
  const [actionButtons, setActionButtons] = useState<ChatActionButton[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!apiReady || !window.yubblo) return

    function apply(settings: AppSettings): void {
      setLocaleState(settings.locale)
      setChatFontSize(settings.chatFontSize)
      setPauseChatOnHoverState(settings.pauseChatOnHover === true)
      setShowFocusModeShortcut(settings.showFocusModeShortcut === true)
      void i18n.changeLanguage(settings.locale)
      setHighlights(settings.highlights || [])
      setHighlightPreferences(settings.highlightPreferences)
      setMonitoring(settings.monitoring)
      setActionButtons(settings.actionButtons || [])
    }

    void window.yubblo.settings
      .get()
      .then(apply)
      .catch((error) => onError(parseIpcError(error)))

    // Janela de settings salva na hora e emite settings:changed
    return window.yubblo.settings.onChanged(apply)
  }, [apiReady, onError])

  const enabledActions = useMemo(
    () => filterEnabledActions(actionButtons),
    [actionButtons]
  )

  async function saveHighlights(next: HighlightRule[]): Promise<void> {
    if (!window.yubblo) return
    setBusy(true)
    try {
      const saved = await window.yubblo.settings.setHighlights(next)
      setHighlights(saved.highlights || next)
    } catch (error) {
      onError(parseIpcError(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveHighlightPreferences(next: HighlightPreferences): Promise<void> {
    if (!window.yubblo) return
    const previous = highlightPreferences
    setBusy(true)
    setHighlightPreferences(next)
    try {
      const saved = await window.yubblo.settings.setHighlightPreferences(next)
      setHighlightPreferences(saved.highlightPreferences)
    } catch (error) {
      setHighlightPreferences(previous)
      onError(parseIpcError(error))
    } finally {
      setBusy(false)
    }
  }
  async function saveMonitoring(next: MonitoringSettings): Promise<void> {
    if (!window.yubblo) return
    const previous = monitoring
    setBusy(true)
    setMonitoring(next)
    try {
      const saved = await window.yubblo.settings.setMonitoring(next)
      setMonitoring(saved.monitoring)
    } catch (error) {
      setMonitoring(previous)
      onError(parseIpcError(error))
    } finally {
      setBusy(false)
    }
  }
  async function saveActionButtons(next: ChatActionButton[]): Promise<void> {
    if (!window.yubblo) return
    setBusy(true)
    try {
      const saved = await window.yubblo.settings.setActionButtons(next)
      setActionButtons(saved.actionButtons || next)
    } catch (error) {
      onError(parseIpcError(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveLocale(next: AppLocale): Promise<void> {
    if (!window.yubblo) return
    const previous = locale
    setBusy(true)
    try {
      const saved = await window.yubblo.settings.setLocale(next)
      setLocaleState(saved.locale)
      await i18n.changeLanguage(saved.locale)
    } catch (error) {
      setLocaleState(previous)
      await i18n.changeLanguage(previous)
      onError(parseIpcError(error))
    } finally {
      setBusy(false)
    }
  }

  async function savePauseChatOnHover(next: boolean): Promise<void> {
    if (!window.yubblo) return
    const previous = pauseChatOnHover
    setBusy(true)
    setPauseChatOnHoverState(next)
    try {
      const saved = await window.yubblo.settings.setPauseChatOnHover(next)
      setPauseChatOnHoverState(saved.pauseChatOnHover)
    } catch (error) {
      setPauseChatOnHoverState(previous)
      onError(parseIpcError(error))
    } finally {
      setBusy(false)
    }
  }

  return {
    locale,
    chatFontSize,
    pauseChatOnHover,
    showFocusModeShortcut,
    highlights,
    highlightPreferences,
    monitoring,
    actionButtons,
    enabledActions,
    busy,
    saveHighlights,
    saveHighlightPreferences,
    saveMonitoring,
    saveActionButtons,
    saveLocale,
    savePauseChatOnHover
  }
}
