import type { ChannelActivityHandleInput } from '../../../../shared/types'
import { parseLocalChatCommand } from '../../../../shared/chat-commands'
import type { ChatAuthor } from './composer/Composer'

type Deps = {
  videoId: string | null
  authors: ChatAuthor[]
  clear(videoId: string): Promise<number>
  openUser(input: ChannelActivityHandleInput): Promise<void>
  send(text: string): Promise<void>
}

export type ChatInputResult = { clearCutoff?: number }

function commandError(message: string, messageKey: string): Error {
  return new Error(JSON.stringify({ code: 'UNKNOWN', message, messageKey }))
}

export async function executeChatInput(text: string, deps: Deps): Promise<ChatInputResult> {
  const command = parseLocalChatCommand(text)
  if (command === 'clear') {
    if (!deps.videoId) return {}
    return { clearCutoff: await deps.clear(deps.videoId) }
  }
  if (command && typeof command === 'object' && command.kind === 'invalid-user') {
    throw commandError('Use /user @handle.', 'chat:commands.userUsage')
  }
  if (command && typeof command === 'object' && command.kind === 'user') {
    if (!deps.videoId) throw commandError('Open a live stream first.', 'chat:commands.userNeedsLive')
    const normalized = command.handle.toLocaleLowerCase()
    const author = deps.authors.find((item) => item.name.replace(/^@/, '').toLocaleLowerCase() === normalized)
    await deps.openUser({
      videoId: deps.videoId,
      handle: command.handle,
      ...(author?.channelId ? { authorChannelId: author.channelId, authorName: author.name } : {})
    })
    return {}
  }
  await deps.send(text)
  return {}
}
