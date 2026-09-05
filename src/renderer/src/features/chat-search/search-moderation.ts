import type { ChatActionButton } from '../../../../shared/contracts/settings'
import type { ChatSearchEntry, ModMenuResult } from '../../../../shared/types'
import { isTimeDurationLabel, matchTimeoutIconType } from '../moderation/moderation-ui'

export type SearchModApi = {
  getModMenu(messageId: string, videoId: string): Promise<ModMenuResult>
  runModAction(
    messageId: string,
    iconType: string,
    videoId: string
  ): Promise<{ needDurationPicker?: ModMenuResult } | void>
}

export function searchModerationMessageId(entry: ChatSearchEntry): string {
  return (entry.systemSourceMessageId || entry.id || '').trim()
}

/** Tombstones e mensagens já removidas não entram na busca: o texto original some. */
export function includeInChatSearch(entry: {
  systemKind?: string
  removed?: boolean
}): boolean {
  return !entry.systemKind && !entry.removed
}

export function canModerateSearchEntry(
  entry: ChatSearchEntry,
  canModerate: boolean
): boolean {
  if (!canModerate) return false
  if (!includeInChatSearch(entry)) return false
  if (entry.isSelf || entry.pending || entry.heldForReview) return false
  if (entry.id.startsWith('local-') && !entry.hasContextMenu) return false
  return Boolean(searchModerationMessageId(entry))
}

export function dropAfterSearchAction(
  messages: ChatSearchEntry[],
  entry: ChatSearchEntry,
  button: ChatActionButton
): ChatSearchEntry[] {
  if (button.kind === 'timeout' || button.kind === 'hide') {
    const channelId = entry.authorChannelId || entry.systemTargetChannelId
    if (channelId) {
      return messages.filter(
        (message) => (message.authorChannelId || message.systemTargetChannelId) !== channelId
      )
    }
  }
  return messages.filter((message) => message.id !== entry.id)
}

export async function iconTypeForSearchAction(
  button: ChatActionButton,
  menu: ModMenuResult
): Promise<string | null> {
  if (button.kind === 'timeout') {
    const durations = (menu.timeoutDurations || []).filter((action) =>
      isTimeDurationLabel(action.label)
    )
    return matchTimeoutIconType(durations, button.timeoutKey || '')
  }
  return menu.actions.find((action) => action.kind === button.kind)?.iconType || null
}

export async function runSearchModeration(
  api: SearchModApi,
  videoId: string,
  entry: ChatSearchEntry,
  button: ChatActionButton
): Promise<void> {
  const messageId = searchModerationMessageId(entry)
  const menu = await api.getModMenu(messageId, videoId)
  if (!menu.canModerate) throw new Error('No moderation permission in this live stream.')
  if (button.kind === 'timeout') {
    let durations = (menu.timeoutDurations || []).filter((action) =>
      isTimeDurationLabel(action.label)
    )
    if (!durations.length) {
      const response = await api.runModAction(messageId, 'TIMEOUT_MENU', videoId)
      const picker = response && typeof response === 'object' && 'needDurationPicker' in response
        ? response.needDurationPicker
        : undefined
      if (picker) {
        durations = (picker.timeoutDurations || picker.actions).filter((action) =>
          isTimeDurationLabel(action.label)
        )
      }
    }
    const iconType = matchTimeoutIconType(durations, button.timeoutKey || '')
    if (!iconType) throw new Error('Duration is not available in this chat.')
    await api.runModAction(messageId, iconType, videoId)
    return
  }
  const action = menu.actions.find((candidate) => candidate.kind === button.kind)
  if (!action) throw new Error('Action is not available in this menu.')
  await api.runModAction(messageId, action.iconType, videoId)
}
