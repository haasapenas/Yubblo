import type { ChatMessage } from '../../../../shared/types'

/** Optimistic unban UI. The main process already emits the named mod-unhide line.
 *  Never promote a chat row (projected hide tombstone id) to a nameless unhide. */
export function applyUnbanPatch(
  messages: ChatMessage[],
  _systemMessageId: string
): ChatMessage[] {
  return messages
}
