export type LocalChatCommand =
  | 'clear'
  | { kind: 'user'; handle: string }
  | { kind: 'invalid-user' }

export function parseLocalChatCommand(value: string): LocalChatCommand | null {
  const trimmed = value.trim()
  if (trimmed.toLowerCase() === '/clear') return 'clear'
  if (!/^\/user(?:\s|$)/i.test(trimmed)) return null
  const match = trimmed.match(/^\/user\s+@?([^\s@]+)$/i)
  return match
    ? { kind: 'user', handle: match[1] }
    : { kind: 'invalid-user' }
}
