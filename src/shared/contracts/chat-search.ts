import type { ChatActionButton } from './settings'

/** Mensagem leve enviada à janela de busca (histórico do chat). */
export type ChatSearchEntry = {
  id: string
  authorName: string
  authorChannelId?: string
  text: string
  timestamp: number
  isModerator?: boolean
  isMember?: boolean
  isOwner?: boolean
  isSelf?: boolean
  systemKind?: string
  systemTargetChannelId?: string
  systemTargetName?: string
  systemSourceMessageId?: string
  hasContextMenu?: boolean
  heldForReview?: boolean
  pending?: boolean
  removed?: boolean
}

export type ChatSearchWindowState = {
  channelLabel: string
  videoId: string | null
  canModerate: boolean
  actionButtons: ChatActionButton[]
  messages: ChatSearchEntry[]
}
