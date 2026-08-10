import type { VirtuosoHandle } from 'react-virtuoso'

export function scrollVirtuosoToBottom(
  handle: VirtuosoHandle | null,
  total: number
): void {
  if (!handle || total <= 0) return
  handle.scrollToIndex({
    index: total - 1,
    align: 'end',
    behavior: 'auto',
    offset: 6
  })
}

export function scrollVirtuosoToIndex(
  handle: VirtuosoHandle | null,
  index: number
): void {
  if (!handle || index < 0) return
  handle.scrollToIndex({ index, align: 'center', behavior: 'auto' })
}