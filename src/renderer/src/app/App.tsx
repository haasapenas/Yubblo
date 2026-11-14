import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ChatMessage,
  AppError,
  ChatSearchEntry
} from '../../../shared/types'
import { Composer, type ComposerReplyRequest } from '../features/chat/composer/Composer'
import { canUseComposer } from '../features/chat/composer/composer-availability'
import { projectModerationMessages } from '../features/moderation/moderation-projection'
import { includeInChatSearch } from '../features/chat-search/search-moderation'
import { useChatMessages } from '../features/chat/use-chat-messages'
import { useVirtualChat } from '../features/chat/use-virtual-chat'
import { createHighlightAudioPlayer } from '../features/chat/highlight-audio-player'
import { useHighlightSounds } from '../features/chat/use-highlight-sounds'
import defaultHighlightSound from '../assets/highlight-default.wav?url'
import { MessageList } from '../features/chat/MessageList'
import { UserProfilePanel } from '../features/chat/UserProfilePanel'
import { ThreadPanel, type ThreadRowProps } from '../features/threads/ThreadPanel'
import { useChatRowHandlers } from './use-chat-row-handlers'
import { useAppBadges } from '../features/app-badges/use-app-badges'
import { useThreads } from '../features/threads/use-threads'
import { useRepeatCounter } from '../features/repeat-counter/use-repeat-counter'
import { applyMonitorCommand, parseMonitorCommand } from '../features/monitoring/monitor-command'
import type { ChatUserProfileTarget } from '../../../shared/channel-profile'
import { FocusModeToggle } from '../features/chat/FocusModeToggle'
import { filterMessagesForFocus } from '../features/chat/focus-mode'
import { toggleMonitoredUser, useSettings } from '../features/settings/use-settings'
import { buildSelfHighlightInput } from '../features/settings/highlights'
import { useAuth } from '../features/auth/use-auth'
import { AppHeader } from '../features/auth/AppHeader'
import { ChannelIdentityModal } from '../features/auth/ChannelIdentityModal'
import { ChannelBar } from '../features/channels/ChannelBar'
import { ChannelTabs } from '../features/channels/ChannelTabs'
import { LivePicker } from '../features/channels/LivePicker'
import { ModerationMenu } from '../features/moderation/ModerationMenu'
import { useModeration } from '../features/moderation/use-moderation'
import { useLiveState } from '../features/live/use-live-state'
import { PinnedMessage } from '../features/live/PinnedMessage'
import { LivePollBanner } from '../features/live/LivePollBanner'
import {
  channelListKeyFromSession,
  useChatSessions
} from '../features/channels/use-chat-sessions'

/** Agrupa IPC de mensagens antes do setState. */
export default function App(): React.JSX.Element {
  const { t, i18n } = useTranslation('common')
  const apiReady = typeof window !== 'undefined' && !!window.yubblo
  /** Mensagens por videoId (cada aba mantém o próprio histórico) */
  const [error, setError] = useState<AppError | null>(null)
  const dropMessagesRef = useRef<(videoId: string) => void>(() => undefined)
  const resetModerationRef = useRef<() => void>(() => undefined)
  const resetLiveRef = useRef<() => void>(() => undefined)
  const {
    highlights,
    highlightPreferences,
    monitoring,
    enabledActions,
    chatFontSize,
    chatMessagePadding,
    separateMessages,
    pauseChatOnHover,
    showFocusModeShortcut,
    colorizeUsernames,
    saveMonitoring
  } = useSettings(apiReady, setError)
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
  const replySequenceRef = useRef(0)
  const [replyRequest, setReplyRequest] = useState<ComposerReplyRequest | null>(null)
  const [expandedDeletedIds, setExpandedDeletedIds] = useState<Set<string>>(
    () => new Set()
  )
  const [userProfileTarget, setUserProfileTarget] = useState<ChatUserProfileTarget | null>(null)
  const {
    auth,
    busy: busyAuth,
    identities: channelIdentities,
    identityPickerOpen: channelPickerOpen,
    identityPickerLoading: channelPickerLoading,
    login: handleLogin,
    switchAccount: handleSwitchAccount,
    removeAccount: handleRemoveAccount,
    openIdentityPicker: openChannelPicker,
    closeIdentityPicker: closeChannelPicker,
    chooseIdentity: handlePickChannelIdentity,
    logout: handleLogout
  } = useAuth(apiReady, resetChatUi, setError)
  const {
    tabs,
    activeVideoId,
    session,
    status,
    siblingLives,
    siblingOwnerKey,
    picker: livePicker,
    pickerBusyVideoId: livePickerBusyId,
    busyOpen,
    openInput,
    pickLive: handlePickLive,
    select: selectTab,
    close: closeTab,
    openSiblingLivesPicker,
    closePicker: closeLivePicker,
    reset: resetChatSessions
  } = useChatSessions({
    apiReady,
    onError: setError,
    onBeforeTransition: () => {
      resetModerationRef.current()
      resetLiveRef.current()
    },
    onDropMessages: (videoId) => dropMessagesRef.current(videoId)
  })
  const {
    setMessagesByChannel,
    messages,
    patchMessages,
    dropMessages,
    setRetentionPaused,
    clearAll: clearAllMessages,
    getAuthors,
    send: handleComposerSend
  } = useChatMessages(apiReady, activeVideoId)
  dropMessagesRef.current = dropMessages
  const threads = useThreads(apiReady, activeVideoId, messages)
  const repeatCounts = useRepeatCounter(apiReady, messages)
  const appBadges = useAppBadges(apiReady)
  const projectedMessages = useMemo(
    () => projectModerationMessages(messages),
    [messages]
  )
  const highlightAudioPlayer = useMemo(() => createHighlightAudioPlayer(
    (path) => window.yubblo.settings.readHighlightSound(path),
    defaultHighlightSound
  ), [])
  const playHighlightSound = useMemo(
    () => (path?: string) => highlightAudioPlayer.play(path),
    [highlightAudioPlayer]
  )
  useEffect(() => () => highlightAudioPlayer.dispose(), [highlightAudioPlayer])
  const selfHighlight = useMemo(() => buildSelfHighlightInput(auth.profile, highlightPreferences), [
    auth.profile?.handle, auth.profile?.name, auth.profile?.channelId,
    highlightPreferences.selfEnabled, highlightPreferences.selfColor
  ])
  const displayMessages = useMemo(
    () => filterMessagesForFocus(
      projectedMessages,
      focusModeEnabled,
      highlights,
      selfHighlight
    ),
    [projectedMessages, focusModeEnabled, highlights, selfHighlight]
  )
  useEffect(() => {
    if (!showFocusModeShortcut) setFocusModeEnabled(false)
  }, [showFocusModeShortcut])
  useHighlightSounds({
    videoId: activeVideoId,
    messages: projectedMessages,
    rules: highlights,
    preferences: highlightPreferences,
    activeIdentity: selfHighlight,
    play: playHighlightSound
  })
  const {
    virtuosoRef,
    onAtBottomChange,
    onMouseEnter: onChatMouseEnter,
    onMouseLeave: onChatMouseLeave,
    isHoverPaused
  } = useVirtualChat(
    displayMessages.length,
    activeVideoId,
    pauseChatOnHover,
    displayMessages.at(-1)?.id
  )
  useEffect(() => {
    if (!activeVideoId) return
    setRetentionPaused(activeVideoId, isHoverPaused)
  }, [activeVideoId, isHoverPaused, setRetentionPaused])

  const canModerateActive = useMemo(() => {
    if (!activeVideoId) return false
    const tab = tabs.find((t) => t.videoId === activeVideoId)
    return !!tab?.canModerate
  }, [tabs, activeVideoId])
  const monitoredUserIds = useMemo(
    () => new Set(monitoring.users.flatMap((user) => user.channelId ? [user.channelId] : [])),
    [monitoring.users]
  )

  const activeTab = useMemo(
    () => tabs.find((t) => t.videoId === activeVideoId) || null,
    [tabs, activeVideoId]
  )
  const composerHistoryKey = channelListKeyFromSession(session) || activeVideoId

  /** Ctrl+F abre uma janela separada com o histórico do canal. */
  useEffect(() => {
    if (!apiReady) return
    function onKey(e: KeyboardEvent): void {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || (e.key !== 'f' && e.key !== 'F')) return
      e.preventDefault()
      const label =
        session?.channelHandle
          ? `@${session.channelHandle.replace(/^@/, '')}`
          : session?.channelName ||
            activeTab?.channelName ||
            activeTab?.title ||
            'chat'
      const entries: ChatSearchEntry[] = projectedMessages.filter(includeInChatSearch).map((m) => ({
        id: m.id,
        authorName: m.authorName || '',
        authorChannelId: m.authorChannelId,
        text: m.text || '',
        timestamp: m.timestamp,
        isModerator: m.isModerator,
        isMember: m.isMember,
        isOwner: m.isOwner,
        isSelf: m.isSelf,
        systemKind: m.systemKind,
        systemTargetChannelId: m.systemTargetChannelId,
        systemTargetName: m.systemTargetName,
        systemSourceMessageId: m.systemSourceMessageId,
        hasContextMenu: m.hasContextMenu,
        heldForReview: m.heldForReview,
        pending: m.pending,
        removed: m.removed
      }))
      void window.yubblo.chat.openSearchWindow({
        channelLabel: label,
        videoId: activeVideoId,
        canModerate: canModerateActive,
        actionButtons: enabledActions.filter(
          (b) => b.enabled && (b.kind === 'timeout' || b.kind === 'delete' || b.kind === 'hide')
        ),
        messages: entries
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [apiReady, projectedMessages, session, activeTab, activeVideoId, canModerateActive, enabledActions])

  const {
    actionBusyIds,
    menu: modMenu,
    menuBusy: modBusy,
    closeMenu: closeModMenu,
    backMenu: backModMenu,
    reset: resetModeration,
    runHeldAction: handleHeldAction,
    runQuickAction,
    warmMenu: warmModMenu,
    openMenu: openModMenu,
    runMenuAction: runMod,
    removeBan: handleRemoveBan
  } = useModeration({
    apiReady,
    activeVideoId,
    canModerate: canModerateActive,
    session,
    patchMessages,
    setMessagesByChannel,
    setError
  })
  resetModerationRef.current = resetModeration

  const {
    poll: livePoll,
    pollVoteBusy,
    pinnedMessage,
    vote: handleVotePoll,
    dismissPoll: handleDismissPoll,
    dismissPin: handleDismissPin,
    reset: resetLiveState
  } = useLiveState(apiReady, activeVideoId, setError)
  resetLiveRef.current = resetLiveState

  function resetChatUi(): void {
    clearAllMessages()
    resetChatSessions()
    resetModerationRef.current()
  }

  async function handleOpenChannel(value: string): Promise<boolean> {
    return openInput(value)
  }

  async function handleSend(text: string): Promise<void> {
    const monitorCommand = parseMonitorCommand(text)
    if (!monitorCommand) return handleComposerSend(text)
    await saveMonitoring(applyMonitorCommand(monitorCommand, getAuthors(), monitoring))
  }

  const rememberReplyTarget = threads.rememberReplyTarget
  const handleReply = useCallback((message: ChatMessage): void => {
    rememberReplyTarget(message)
    setReplyRequest({
      sequence: ++replySequenceRef.current,
      authorName: message.authorName
    })
  }, [rememberReplyTarget])
  const toggleMonitoring = useCallback((target: { channelId: string; name: string }) => {
    void saveMonitoring(toggleMonitoredUser(monitoring, target))
  }, [monitoring, saveMonitoring])
  const rowHandlers = useChatRowHandlers({
    activeVideoId,
    toggleMonitoring,
    runQuickAction,
    openModMenu,
    handleHeldAction,
    handleRemoveBan,
    setError,
    setUserProfileTarget,
    setExpandedDeletedIds
  })

  if (!apiReady) {
    return (
      <div className="app" style={{ padding: 24 }}>
        <div className="empty" style={{ margin: 0 }}>
          <h2>{t('errors.renderer.rootMissing')}</h2>
          <p>
            {t('errors.renderer.preloadMissing')}
          </p>
          <p>
            <code>npm run dev</code>
          </p>
          <p style={{ marginTop: 12, color: '#ff6b6b' }}>
            {error?.messageKey
              ? i18n.t(error.messageKey as 'chat:commands.userUsage', error.params ?? {})
              : error?.message || t('errors.renderer.preloadMissing')}
          </p>
        </div>
      </div>
    )
  }

  const canChat = canUseComposer(auth.loggedIn, !!session)

  let statusClass = ''
  let statusText: string = t('status.enterChannel')
  if (status === 'connecting' || busyOpen) {
    statusClass = 'connecting'
    statusText =
      tabs.length > 1
        ? t('status.connectingChannels', { count: tabs.length })
        : t('status.connectingChat')
  } else if (status === 'live' && session) {
    statusClass = 'live'
    statusText = session.title
  } else if (status === 'ended') {
    statusText = t('status.ended')
  } else if (status === 'error' && error) {
    statusClass = 'error'
    statusText = error.messageKey ? i18n.t(error.messageKey as 'chat:commands.userUsage', error.params ?? {}) : error.message
  } else if (error) {
    statusClass = 'error'
    statusText = error.messageKey ? i18n.t(error.messageKey as 'chat:commands.userUsage', error.params ?? {}) : error.message
  }

  if (status === 'ended') {
    statusText = session
      ? t('status.offlineNamed', { channel: session.channelName || session.title })
      : t('status.offline')
  }

  const chatRowProps: ThreadRowProps = {
    chatFontSize,
    chatMessagePadding,
    separateMessages,
    colorizeUsernames,
    canModerate: canModerateActive,
    canReply: canChat,
    highlights,
    monitoring,
    selfHighlight,
    actionButtons: enabledActions,
    actionBusyIds,
    expandedDeletedIds,
    channelHandle: session?.channelHandle,
    channelName: session?.channelName,
    ...rowHandlers,
    onReply: handleReply,
    onWarmMenu: warmModMenu,
    repeatCounts,
    appBadges
  }
  const threadDisplayMessages = threads.threadIds.size
    ? projectedMessages.filter((message) => threads.threadIds.has(message.id))
    : []

  return (
    <div className="app">
      <AppHeader
        auth={auth}
        busy={busyAuth}
        onOpenSettings={() => {
          void window.yubblo.settings.openWindow()
        }}
        onLogin={() => { void handleLogin() }}
        onSwitchAccount={(accountId) => { void handleSwitchAccount(accountId) }}
        onRemoveAccount={(accountId) => { void handleRemoveAccount(accountId) }}
        onOpenIdentityPicker={() => { void openChannelPicker() }}
        onLogout={() => { void handleLogout() }}
      />

      <ChannelTabs
        tabs={tabs}
        activeVideoId={activeVideoId}
        onSelect={(videoId) => { void selectTab(videoId) }}
        onClose={(videoId) => { void closeTab(videoId) }}
        onReorder={(keys) => { void window.yubblo.chat.reorderTabs(keys) }}
        addSlot={
          <ChannelBar
            busy={busyOpen}
            onOpen={handleOpenChannel}
          />
        }
      />

      <div className={`status-line ${statusClass}`}>
        <span className="status-line-text" title={statusText}>
          {statusText}
        </span>
        {session &&
          siblingLives.length > 1 &&
          siblingOwnerKey != null &&
          siblingOwnerKey === channelListKeyFromSession(session) && (
          <button
            type="button"
            className="status-lives-btn"
            onClick={() => openSiblingLivesPicker()}
            title={t('status.otherLives')}
          >
            <span className="status-lives-dot" aria-hidden />
            {t('status.liveCount', { count: siblingLives.length })}
            <span className="status-lives-caret">▾</span>
          </button>
        )}
        {showFocusModeShortcut && (
          <FocusModeToggle
            enabled={focusModeEnabled}
            onToggle={() => setFocusModeEnabled((current) => !current)}
          />
        )}
      </div>

      <LivePollBanner
        poll={livePoll}
        activeVideoId={activeVideoId}
        busyOptionId={pollVoteBusy}
        onVote={(optionId) => { void handleVotePoll(optionId) }}
        onDismiss={() => { void handleDismissPoll() }}
      />

      <MessageList
        messages={displayMessages}
        sourceMessages={messages}
        status={status}
        {...chatRowProps}
        isHoverPaused={isHoverPaused}
        virtuosoRef={virtuosoRef}
        onAtBottomChange={onAtBottomChange}
        onMouseEnter={onChatMouseEnter}
        onMouseLeave={onChatMouseLeave}
        threadLinks={threads.enabled ? threads.links : undefined}
        onOpenThread={threads.openThread}
      />

      <LivePicker
        picker={livePicker}
        activeVideoId={activeVideoId}
        busyVideoId={livePickerBusyId}
        onClose={closeLivePicker}
        onPick={(live) => { void handlePickLive(live) }}
      />

      <ChannelIdentityModal
        open={channelPickerOpen}
        loading={channelPickerLoading}
        busy={busyAuth}
        identities={channelIdentities}
        onClose={closeChannelPicker}
        onChoose={(identityId) => { void handlePickChannelIdentity(identityId) }}
      />

      {userProfileTarget ? (
        <UserProfilePanel target={userProfileTarget} onClose={() => setUserProfileTarget(null)} />
      ) : null}
      {threadDisplayMessages.length > 0 ? (
        <ThreadPanel
          messages={threadDisplayMessages}
          sourceMessages={messages}
          rowProps={chatRowProps}
          onClose={threads.closeThread}
        />
      ) : null}

      <ModerationMenu
        menu={modMenu}
        busy={modBusy}
        onClose={closeModMenu}
        onBack={backModMenu}
        onRun={(action) => { void runMod(action) }}
        monitoredUserIds={monitoredUserIds}
        onToggleMonitoring={(target) => {
          closeModMenu()
          void saveMonitoring(toggleMonitoredUser(monitoring, target))
        }}
        onOpenChannelActivity={(target) => {
          closeModMenu()
          void window.yubblo.chat.openChannelActivityWindow(target).catch((cause) => {
            setError({ code: 'UNKNOWN', message: cause instanceof Error ? cause.message : String(cause) })
          })
        }}
      />

      <PinnedMessage
        message={pinnedMessage}
        activeVideoId={activeVideoId}
        onDismiss={() => { void handleDismissPin() }}
      />

      <Composer
        historyKey={composerHistoryKey}
        replyRequest={replyRequest}
        canChat={canChat}
        authLoggedIn={auth.loggedIn}
        activeVideoId={activeVideoId}
        sendCooldownUntil={activeTab?.sendCooldownUntil}
        slowModeSeconds={activeTab?.slowModeSeconds}
        getAuthors={getAuthors}
        onSend={handleSend}
        onError={setError}
      />
    </div>
  )
}
