export interface ChatCommandInfo {
  name: string
  args?: string
  descriptionKey: 'commandList.clear' | 'commandList.user' | 'commandList.monitor' | 'commandList.unmonitor'
  insertText: string
}

export const CHAT_COMMANDS: readonly ChatCommandInfo[] = [
  { name: 'clear', descriptionKey: 'commandList.clear', insertText: '/clear' },
  { name: 'user', args: '@handle', descriptionKey: 'commandList.user', insertText: '/user @' },
  { name: 'monitor', args: '@handle', descriptionKey: 'commandList.monitor', insertText: '/monitor @' },
  { name: 'unmonitor', args: '@handle', descriptionKey: 'commandList.unmonitor', insertText: '/unmonitor @' }
]

export function commandQueryAt(text: string, cursor: number): string | null {
  const before = text.slice(0, Math.max(0, Math.min(cursor, text.length)))
  const match = /^\/(\S*)$/.exec(before)
  return match ? match[1].toLocaleLowerCase() : null
}

export function filterCommands(query: string): ChatCommandInfo[] {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return [...CHAT_COMMANDS]
  const starts = CHAT_COMMANDS.filter((command) => command.name.startsWith(q))
  const contains = CHAT_COMMANDS.filter((command) =>
    !command.name.startsWith(q) && command.name.includes(q)
  )
  return [...starts, ...contains]
}
