import { useEffect, useState } from 'react'
import type { AppBadgeId, AppBadgeMap } from '../../../../shared/app-badges'

const EMPTY: ReadonlyMap<string, AppBadgeId> = new Map()

function toMap(badges: AppBadgeMap): ReadonlyMap<string, AppBadgeId> {
  return new Map(Object.entries(badges))
}

export function useAppBadges(apiReady: boolean): ReadonlyMap<string, AppBadgeId> {
  const [badges, setBadges] = useState<ReadonlyMap<string, AppBadgeId>>(EMPTY)

  useEffect(() => {
    if (!apiReady || !window.yubblo?.appBadges) return
    const apply = (next: AppBadgeMap): void => setBadges(toMap(next))
    void window.yubblo.appBadges.get().then(apply).catch(() => undefined)
    return window.yubblo.appBadges.onChanged(apply)
  }, [apiReady])

  return badges
}
