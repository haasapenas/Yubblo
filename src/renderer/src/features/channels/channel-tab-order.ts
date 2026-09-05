export function moveTabKey(
  keys: string[],
  fromKey: string,
  toIndex: number
): string[] {
  const from = keys.indexOf(fromKey)
  if (from < 0) return keys
  const bounded = Math.max(0, Math.min(toIndex, keys.length - 1))
  if (from === bounded) return keys
  const next = [...keys]
  const [moved] = next.splice(from, 1)
  next.splice(bounded, 0, moved!)
  return next
}

export function tabIndexAtPoint(
  root: HTMLElement,
  x: number,
  y: number
): number {
  const nodes = [...root.querySelectorAll<HTMLElement>('[data-tab-key]')]
  if (!nodes.length) return -1
  for (let index = 0; index < nodes.length; index++) {
    const box = nodes[index]!.getBoundingClientRect()
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
      return index
    }
  }
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  nodes.forEach((node, index) => {
    const box = node.getBoundingClientRect()
    const dx = (box.left + box.right) / 2 - x
    const dy = (box.top + box.bottom) / 2 - y
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = index
    }
  })
  return best
}
