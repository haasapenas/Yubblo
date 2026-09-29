import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, ChatMessage } from '../../../../shared/types'
import { buildRepeatCounts, EMPTY_REPEAT_COUNTS } from './repeat-index'

export function useRepeatCounter(
  apiReady: boolean,
  messages: readonly ChatMessage[]
): ReadonlyMap<string, number> | undefined {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (!apiReady || !window.yubblo) return
    const apply = (settings: AppSettings): void => setEnabled(settings.repeatCounter === true)
    void window.yubblo.settings.get().then(apply).catch(() => undefined)
    return window.yubblo.settings.onChanged(apply)
  }, [apiReady])

  const counts = useMemo(
    () => enabled ? buildRepeatCounts(messages) : EMPTY_REPEAT_COUNTS,
    [enabled, messages]
  )

  return enabled ? counts : undefined
}
