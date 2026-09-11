import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ChatActionButton } from '../../../../shared/types'
import {
  dropIndexFromY,
  moveActionButton,
  snapshotActionRows,
  type ActionRowRect
} from './action-button-operations'

export function actionIdFromPoint(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  const row = target.closest('[data-action-id]')
  const id = row?.getAttribute('data-action-id')?.trim()
  return id || null
}

export function useActionButtonReorder(
  buttons: ChatActionButton[],
  opts: { disabled: boolean; onCommit(next: ChatActionButton[]): void }
) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState(0)
  const rowsRef = useRef<ActionRowRect[]>([])
  const onCommitRef = useRef(opts.onCommit)
  onCommitRef.current = opts.onCommit

  const displayed = dragId
    ? moveActionButton(buttons, dragId, dropIndex)
    : buttons

  const onGripPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (opts.disabled || event.button !== 0) return
    const id = actionIdFromPoint(event.currentTarget)
    const list = event.currentTarget.closest('ul')
    if (!id || !list) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const sourceIndex = buttons.findIndex((button) => button.id === id)
    rowsRef.current = snapshotActionRows(list)
    setDragId(id)
    setDropIndex(sourceIndex < 0 ? 0 : sourceIndex)
  }, [buttons, opts.disabled])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragId) return
    setDropIndex(dropIndexFromY(rowsRef.current, dragId, event.clientY))
  }, [dragId])

  const finish = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragId) return
    const next = moveActionButton(buttons, dragId, dropIndex)
    const changed = next.some((button, index) => button.id !== buttons[index]?.id)
    setDragId(null)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* capture já solta */
    }
    if (changed) onCommitRef.current(next)
  }, [buttons, dragId, dropIndex])

  return {
    displayed,
    dragId,
    onGripPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish
  }
}
