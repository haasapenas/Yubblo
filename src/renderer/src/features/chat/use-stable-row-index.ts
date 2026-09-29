import { useMemo, useRef } from 'react'
import type { ChatMessage } from '../../../../shared/types'

export function assignRowSequence(
  messages: readonly ChatMessage[],
  previous: ReadonlyMap<string, number>,
  nextSequence: number
): { sequence: Map<string, number>; nextSequence: number } {
  const sequence = new Map<string, number>()
  let next = nextSequence
  for (const message of messages) {
    const known = previous.get(message.id)
    sequence.set(message.id, known ?? next++)
  }
  return { sequence, nextSequence: next }
}

export function useStableRowIndex(messages: readonly ChatMessage[]): ReadonlyMap<string, number> {
  const stateRef = useRef<{ sequence: ReadonlyMap<string, number>; nextSequence: number }>({
    sequence: new Map(),
    nextSequence: 0
  })
  return useMemo(() => {
    const result = assignRowSequence(messages, stateRef.current.sequence, stateRef.current.nextSequence)
    stateRef.current = result
    return result.sequence
  }, [messages])
}
