/** Mensagem leve enviada à janela de busca (histórico do chat). */
export type ChatSearchEntry = {
  id: string
  authorName: string
  text: string
  timestamp: number
  isModerator?: boolean
  isMember?: boolean
  isOwner?: boolean
  isSelf?: boolean
  systemKind?: string
  removed?: boolean
}

export type ChatSearchWindowState = {
  channelLabel: string
  videoId: string | null
  messages: ChatSearchEntry[]
}
