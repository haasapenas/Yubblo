import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { HoverScrollGate } from './hover-scroll-gate'
import {
  scrollVirtuosoToBottom,
  scrollVirtuosoToIndex
} from './virtuoso-scroll'

export interface UseVirtualChatResult {
  virtuosoRef: RefObject<VirtuosoHandle | null>
  isHoverPaused: boolean
  isAtBottom: boolean
  onAtBottomChange(atBottom: boolean): void
  onMouseEnter(): void
  onMouseLeave(): void
  scrollToBottom(force?: boolean): void
  scrollToIndex(index: number): void
}

export function useVirtualChat(
  total: number,
  activeVideoId: string | null,
  pauseOnHover = false,
  tailMessageId?: string
): UseVirtualChatResult {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const totalRef = useRef(total)
  totalRef.current = total
  const previousTailIdRef = useRef(tailMessageId)
  const atBottomRef = useRef(true)
  const hoverGate = useRef<HoverScrollGate | null>(null)
  const [isHoverPaused, setIsHoverPaused] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const scrollToBottom = useCallback((force = false): void => {
    if (!force && !atBottomRef.current) return
    atBottomRef.current = true
    setIsAtBottom(true)
    scrollVirtuosoToBottom(virtuosoRef.current, totalRef.current)
  }, [])

  if (!hoverGate.current) {
    hoverGate.current = new HoverScrollGate(
      pauseOnHover,
      () => scrollToBottom(true),
      setIsHoverPaused
    )
  }

  useLayoutEffect(() => {
    hoverGate.current?.setEnabled(pauseOnHover)
  }, [pauseOnHover])

  useLayoutEffect(() => {
    atBottomRef.current = true
    setIsAtBottom(true)
    scrollToBottom(true)
  }, [activeVideoId, scrollToBottom])

  useLayoutEffect(() => {
    const previousTailId = previousTailIdRef.current
    previousTailIdRef.current = tailMessageId
    if (!tailMessageId || previousTailId === tailMessageId) return
    if (!hoverGate.current?.shouldAutoScroll(atBottomRef.current)) return
    scrollVirtuosoToBottom(virtuosoRef.current, totalRef.current)
  }, [tailMessageId])

  const onAtBottomChange = useCallback((atBottom: boolean): void => {
    atBottomRef.current = atBottom
    setIsAtBottom(atBottom)
  }, [])

  const onMouseEnter = useCallback((): void => {
    hoverGate.current?.enter()
  }, [])

  const onMouseLeave = useCallback((): void => {
    hoverGate.current?.leave()
  }, [])

  const scrollToIndex = useCallback((index: number): void => {
    atBottomRef.current = false
    setIsAtBottom(false)
    scrollVirtuosoToIndex(virtuosoRef.current, index)
  }, [])

  return {
    virtuosoRef,
    isHoverPaused,
    isAtBottom,
    onAtBottomChange,
    onMouseEnter,
    onMouseLeave,
    scrollToBottom,
    scrollToIndex
  }
}