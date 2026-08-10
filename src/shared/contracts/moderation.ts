export type ModActionKind = 'delete' | 'timeout' | 'hide' | 'unhide' | 'other'

export interface ModMenuAction {
  iconType: string
  label: string
  kind: ModActionKind
}

export interface ModMenuResult {
  messageId: string
  actions: ModMenuAction[]
  timeoutDurations?: ModMenuAction[]
  canModerate: boolean
  channelActivityAvailable?: boolean
}
