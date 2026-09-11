import type { ChatActionButton } from '../../../../shared/types'

export function moveActionButton(
  buttons: ChatActionButton[],
  id: string,
  targetIndex: number
): ChatActionButton[] {
  const sourceIndex = buttons.findIndex((button) => button.id === id)
  if (sourceIndex < 0) return [...buttons]
  const next = [...buttons]
  const [moved] = next.splice(sourceIndex, 1)
  const boundedTarget = Math.max(0, Math.min(targetIndex, next.length))
  next.splice(boundedTarget, 0, moved!)
  return next
}

export function previewReorder(
  buttons: ChatActionButton[],
  dragId: string,
  overId: string
): ChatActionButton[] {
  if (!dragId || !overId || dragId === overId) return [...buttons]
  const overIndex = buttons.findIndex((button) => button.id === overId)
  if (overIndex < 0) return [...buttons]
  return moveActionButton(buttons, dragId, overIndex)
}

export type ActionRowRect = { id: string; top: number; height: number }

export function dropIndexFromY(
  rows: ActionRowRect[],
  dragId: string,
  clientY: number
): number {
  const others = rows.filter((row) => row.id !== dragId)
  for (let index = 0; index < others.length; index++) {
    const row = others[index]!
    if (clientY < row.top + row.height / 2) return index
  }
  return others.length
}

export function snapshotActionRows(list: Element): ActionRowRect[] {
  return [...list.querySelectorAll('[data-action-id]')].flatMap((node) => {
    const id = node.getAttribute('data-action-id')?.trim()
    if (!id) return []
    const rect = node.getBoundingClientRect()
    return [{ id, top: rect.top, height: rect.height }]
  })
}
