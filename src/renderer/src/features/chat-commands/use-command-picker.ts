import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { commandQueryAt, filterCommands, type ChatCommandInfo } from './command-catalog'

export interface CommandPickerState {
  open: boolean
  commands: ChatCommandInfo[]
  activeIndex: number
  setActiveIndex(index: number): void
  update(text: string, cursor: number): void
  close(): void
  pick(command: ChatCommandInfo): void
  pickActive(): boolean
  handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): boolean
}

export function useCommandPicker(onApply: (text: string) => void): CommandPickerState {
  const [query, setQuery] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const commands = useMemo(
    () => query === null ? [] : filterCommands(query),
    [query]
  )
  const open = commands.length > 0

  const update = useCallback((text: string, cursor: number): void => {
    setQuery(commandQueryAt(text, cursor))
    setActiveIndex(0)
  }, [])

  const close = useCallback((): void => setQuery(null), [])

  const pick = useCallback((command: ChatCommandInfo): void => {
    setQuery(null)
    onApply(command.insertText)
  }, [onApply])

  const pickActive = useCallback((): boolean => {
    if (!open) return false
    const command = commands[activeIndex] || commands[0]
    if (!command) return false
    pick(command)
    return true
  }, [activeIndex, commands, open, pick])

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>): boolean => {
    if (!open) return false
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % commands.length)
      return true
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + commands.length) % commands.length)
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      return pickActive()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return true
    }
    return false
  }, [close, commands.length, open, pickActive])

  return { open, commands, activeIndex, setActiveIndex, update, close, pick, pickActive, handleKeyDown }
}
