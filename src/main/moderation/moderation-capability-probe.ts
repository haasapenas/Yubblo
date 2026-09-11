export type ModerationProbeState = 'idle' | 'inflight' | 'done'

export type ModerationProbeSession = {
  canModerate: boolean
  moderationProbe: ModerationProbeState
}

export function takeModerationProbe(
  session: ModerationProbeSession,
  input: { messageId: string; isSelf: boolean; hasMenuParams: boolean }
): string | undefined {
  if (session.canModerate) return undefined
  if (session.moderationProbe !== 'idle') return undefined
  if (input.isSelf || !input.hasMenuParams || !input.messageId) return undefined
  session.moderationProbe = 'inflight'
  return input.messageId
}

export function finishModerationProbe(session: ModerationProbeSession): void {
  session.moderationProbe = 'done'
}
