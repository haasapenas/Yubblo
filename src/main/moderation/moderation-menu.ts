import type { ModMenuResult } from '../../shared/types'
import {
  filterOnlyTimeDurations,
  isConfirmedModEndpoint,
  isLiveChatModerateApi,
  rawToMenuActions,
  type RawModEndpoint
} from './moderation-parser'

interface CompileModerationMenuInput {
  messageId: string
  endpoints: RawModEndpoint[]
  timeoutCandidates: RawModEndpoint[]
  targetIsSelf: boolean
}

export interface CompiledModerationMenu {
  menu: ModMenuResult
  endpointsToCache: RawModEndpoint[]
  unhideEndpoint?: RawModEndpoint
}

export function compileModerationMenu({
  messageId,
  endpoints,
  timeoutCandidates,
  targetIsSelf
}: CompileModerationMenuInput): CompiledModerationMenu {
  const durationEndpoints = filterOnlyTimeDurations([
    ...endpoints.filter((endpoint) => endpoint.kind === 'timeout'),
    ...timeoutCandidates
  ])
  const otherEndpoints = endpoints.filter((endpoint) =>
    endpoint.kind === 'delete' ||
    endpoint.kind === 'hide' ||
    endpoint.kind === 'unhide'
  )
  const hasTimeout =
    durationEndpoints.length > 0 ||
    endpoints.some((endpoint) => endpoint.kind === 'timeout')

  const endpointsToCache = [...otherEndpoints, ...durationEndpoints]
  if (hasTimeout) {
    endpointsToCache.push({
      apiUrl: 'live_chat/get_item_context_menu',
      body: {},
      label: 'timeout',
      iconType: 'TIMEOUT_MENU',
      kind: 'timeout'
    })
  }

  const actions: ModMenuResult['actions'] = []
  const deleteEndpoint = otherEndpoints.find((endpoint) => endpoint.kind === 'delete')
  const hideEndpoint = otherEndpoints.find((endpoint) => endpoint.kind === 'hide')
  const unhideEndpoint = otherEndpoints.find((endpoint) => endpoint.kind === 'unhide')

  if (deleteEndpoint) {
    actions.push({ iconType: deleteEndpoint.iconType, label: 'delete', kind: 'delete' })
  }
  if (hasTimeout) {
    actions.push({ iconType: 'TIMEOUT_MENU', label: 'timeout', kind: 'timeout' })
  }
  if (hideEndpoint) {
    actions.push({ iconType: hideEndpoint.iconType, label: 'hide', kind: 'hide' })
  }
  if (unhideEndpoint) {
    actions.push({ iconType: unhideEndpoint.iconType, label: 'unhide', kind: 'unhide' })
  }
  if (actions.length === 0) actions.push(...rawToMenuActions(otherEndpoints).slice(0, 4))

  const timeoutDurations = durationEndpoints.map((endpoint) => ({
    iconType: endpoint.iconType,
    label: endpoint.label,
    kind: 'timeout' as const
  }))
  const confirmedModeration =
    otherEndpoints.some(isConfirmedModEndpoint) ||
    durationEndpoints.some(isConfirmedModEndpoint) ||
    endpoints.some(
      (endpoint) =>
        endpoint.kind === 'timeout' &&
        isLiveChatModerateApi(endpoint.apiUrl || '')
    )
  const canModerate =
    !targetIsSelf &&
    confirmedModeration &&
    actions.some((action) =>
      action.kind === 'delete' ||
      action.kind === 'timeout' ||
      action.kind === 'hide' ||
      action.kind === 'unhide'
    )
  const availableActions = canModerate
    ? actions
    : targetIsSelf
      ? actions.filter((action) => action.kind === 'delete')
      : []

  return {
    menu: {
      messageId,
      actions: availableActions,
      timeoutDurations:
        canModerate && timeoutDurations.length > 0
          ? timeoutDurations
          : undefined,
      canModerate
    },
    endpointsToCache,
    unhideEndpoint
  }
}
