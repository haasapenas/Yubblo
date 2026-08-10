import type { ChannelActivityGroup } from '../../shared/types'

export function mergeChannelActivityGroups(current: ChannelActivityGroup[], incoming: ChannelActivityGroup[], limit: number): ChannelActivityGroup[] {
  const groups = new Map<string, ChannelActivityGroup>()
  const ids = new Map<string, Set<string>>()
  for (const source of [...current, ...incoming]) {
    let target = groups.get(source.key)
    if (!target) {
      target = { key: source.key, title: source.title, messages: [] }
      groups.set(source.key, target)
      ids.set(source.key, new Set())
    }
    const seen = ids.get(source.key)!
    for (const message of source.messages) {
      if (target.messages.length >= limit) break
      if (seen.has(message.id)) continue
      seen.add(message.id)
      target.messages.push(message)
    }
  }
  return [...groups.values()]
}
