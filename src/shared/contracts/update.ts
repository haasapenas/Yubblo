export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'unsupported'

export interface AppUpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  progressPercent?: number
  error?: string
}

