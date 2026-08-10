import { CHANNEL_ACTIVITY_MESSAGES_PER_LIVE_LIMIT, type ChannelActivityGroup, type ChannelActivityMessage, type ChannelActivityProfile, type ChannelActivityReputation } from '../../shared/types'

type Rec = Record<string, unknown>
const rec = (value: unknown): Rec | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Rec : null
function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  const node = rec(value)
  if (!node) return ''
  if (typeof node.content === 'string') return node.content
  if (typeof node.simpleText === 'string') return node.simpleText
  if (typeof node.text === 'string') return node.text
  return Array.isArray(node.runs) ? node.runs.map(text).join('') : ''
}
function findContents(root: unknown): unknown[] {
  const stack = [root]
  while (stack.length) {
    const value = stack.pop()
    const node = rec(value)
    if (!node) continue
    const section = rec(node.sectionListRenderer)
    if (Array.isArray(section?.contents)) return section.contents
    const append = rec(node.appendContinuationItemsAction)
    if (Array.isArray(append?.continuationItems)) return append.continuationItems
    for (const child of Object.values(node)) if (child && typeof child === 'object') Array.isArray(child) ? stack.push(...child) : stack.push(child)
  }
  return []
}
function largestThumbnail(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.map(rec).filter(Boolean) as Rec[]
  items.sort((a, b) => Number(a.width || 0) - Number(b.width || 0))
  const url = items.at(-1)?.url
  return typeof url === 'string' ? url : undefined
}
function parseMessage(value: unknown): ChannelActivityMessage | null {
  const message = rec(rec(value)?.liveChatTextMessageRenderer)
  if (!message || typeof message.id !== 'string') return null
  return {
    id: message.id,
    authorName: text(message.authorName).slice(0, 200),
    avatarUrl: largestThumbnail(rec(message.authorPhoto)?.thumbnails),
    text: text(message.message).slice(0, 2000),
    timestamp: Math.floor(Number(message.timestampUsec || message.timestamp_usec || 0) / 1000)
  }
}

function fullVideoMessages(list: Rec): { messages: ChannelActivityMessage[]; channelId?: string } | null {
  const stack: unknown[] = [list]
  while (stack.length) {
    const value = stack.pop()
    const node = rec(value)
    if (!node) continue
    const panel = rec(node.engagementPanelSectionListRenderer)
    if (panel?.targetId === 'PAlc_channel_activity_video_messages') {
      const panelStack: unknown[] = [panel.content]
      while (panelStack.length) {
        const nested = rec(panelStack.pop())
        if (!nested) continue
        const display = rec(nested.liveChatItemDisplayListRenderer)
        if (display && Array.isArray(display.items)) {
          const messages = display.items.slice(0, CHANNEL_ACTIVITY_MESSAGES_PER_LIVE_LIMIT).map(parseMessage).filter(Boolean) as ChannelActivityMessage[]
          const first = rec(rec(display.items[0])?.liveChatTextMessageRenderer)
          return { messages, channelId: typeof first?.authorExternalChannelId === 'string' ? first.authorExternalChannelId : undefined }
        }
        for (const child of Object.values(nested)) if (child && typeof child === 'object') Array.isArray(child) ? panelStack.push(...child) : panelStack.push(child)
      }
    }
    for (const child of Object.values(node)) if (child && typeof child === 'object') Array.isArray(child) ? stack.push(...child) : stack.push(child)
  }
  return null
}

export function parseChannelActivityPage(root: unknown): { profile?: ChannelActivityProfile; reputation?: ChannelActivityReputation; groups: ChannelActivityGroup[]; continuation?: string } {
  const contents = findContents(root)
  let profile: ChannelActivityProfile | undefined
  let reputation: ChannelActivityReputation | undefined
  let title = ''
  let continuation: string | undefined
  const groups: ChannelActivityGroup[] = []
  for (const wrapper of contents) {
    const node = rec(wrapper)
    if (!node) continue
    const identity = rec(node.liveChatProfileIdentityViewModel)
    if (identity) profile = { channelId: '', name: text(identity.channelName).slice(0, 200), avatarUrl: largestThumbnail(rec(rec(rec(identity.channelAvatar)?.avatarViewModel)?.image)?.sources), createdText: text(identity.channelCreateTime).slice(0, 300) || undefined, subscribersText: text(identity.channelSubscriberCount).slice(0, 300) || undefined }
    const rep = rec(node.liveChatChannelActivityReputationRenderer)
    if (rep && Array.isArray(rep.factoids)) {
      const values = rep.factoids.map((item) => Number(text(rec(rec(item)?.factoidRenderer)?.value).replace(/\D/g, '')) || 0)
      reputation = { deletedMessages: values[0] || 0, timeouts: values[1] || 0, hides: values[2] || 0 }
    }
    const list = rec(node.listItemViewModel)
    if (list) {
      title = text(list.title).slice(0, 300)
      const full = fullVideoMessages(list)
      if (title && full?.messages.length) {
        groups.push({ key: title, title, messages: full.messages })
        if (profile && !profile.channelId && full.channelId) profile.channelId = full.channelId
        title = ''
      }
    }
    const display = rec(node.liveChatItemDisplayListRenderer)
    if (display && title && Array.isArray(display.items)) {
      const messages = display.items.map(parseMessage).filter(Boolean) as ChannelActivityMessage[]
      if (messages.length) {
        groups.push({ key: title, title, messages })
        if (profile && !profile.channelId) {
          const rawMessage = rec(rec(display.items[0])?.liveChatTextMessageRenderer)
          if (typeof rawMessage?.authorExternalChannelId === 'string') profile.channelId = rawMessage.authorExternalChannelId
        }
      }
    }
    const command = rec(rec(rec(node.continuationItemRenderer)?.continuationEndpoint)?.continuationCommand)
    if (typeof command?.token === 'string') continuation = command.token
  }
  return { profile, reputation, groups, continuation }
}
