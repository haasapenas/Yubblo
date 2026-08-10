type AnyRecord = Record<string, unknown>

export type IncomingModerationEvent = {
  rendererId?: string
  kind: 'timeout' | 'hide' | 'delete'
  text: string
  messageId?: string
  durationSeconds?: number
  authorChannelId?: string
  targetName?: string
  moderatorName?: string
  timestamp?: number
}

export type ModerationActivityActivation =
  | { status: 'activated'; continuation: string; bootstrapResponse: unknown }
  | { status: 'already-active'; continuation: string; bootstrapResponse: unknown }
  | { status: 'skipped-replay' }
  | { status: 'unavailable' }

export type InnertubeExecute = (
  endpoint: string,
  payload: Record<string, unknown>
) => Promise<unknown>

function record(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : null
}

function firstRecord(value: unknown, keys: string[]): AnyRecord | null {
  const node = record(value)
  if (!node) return null
  for (const key of keys) {
    const found = record(node[key])
    if (found) return found
  }
  return null
}

function rawLiveChat(response: unknown): AnyRecord | null {
  const root = record(response)
  const continuation = firstRecord(root, [
    'continuationContents',
    'continuation_contents'
  ])
  return firstRecord(continuation, [
    'liveChatContinuation',
    'live_chat_continuation'
  ])
}

export function extractRawLiveChatActions(response: unknown): unknown[] {
  const actions = rawLiveChat(response)?.actions
  return Array.isArray(actions) ? actions : []
}

function isRawModerationRendererAction(action: unknown): boolean {
  const node = record(action)
  const add = firstRecord(node, ['addChatItemAction', 'add_chat_item_action'])
  const item = record(add?.item)
  return !!firstRecord(item, [
    'liveChatModerationMessageRenderer',
    'live_chat_moderation_message_renderer'
  ])
}

/**
 * Faz cópia rasa apenas do caminho do continuation e retira o renderer que a
 * versão atual do youtubei.js não conhece. O JSON original continua disponível
 * para a extração da atividade de moderação.
 */
export function withoutRawModerationRenderers(response: unknown): unknown {
  const root = record(response)
  if (!root) return response
  const continuationKey = record(root.continuationContents)
    ? 'continuationContents'
    : record(root.continuation_contents)
      ? 'continuation_contents'
      : null
  if (!continuationKey) return response

  const continuation = record(root[continuationKey])
  const liveKey = record(continuation?.liveChatContinuation)
    ? 'liveChatContinuation'
    : record(continuation?.live_chat_continuation)
      ? 'live_chat_continuation'
      : null
  if (!continuation || !liveKey) return response

  const live = record(continuation[liveKey])
  const actions = live?.actions
  if (!live || !Array.isArray(actions)) return response
  const filtered = actions.filter((action) => !isRawModerationRendererAction(action))
  if (filtered.length === actions.length) return response

  return {
    ...root,
    [continuationKey]: {
      ...continuation,
      [liveKey]: {
        ...live,
        actions: filtered
      }
    }
  }
}

function isRawBootstrapChatItem(action: unknown): boolean {
  const node = record(action)
  const add = firstRecord(node, ['addChatItemAction', 'add_chat_item_action'])
  const item = record(add?.item)
  return (
    !!firstRecord(item, [
      'liveChatTextMessageRenderer',
      'liveChatPaidMessageRenderer',
      'liveChatMembershipItemRenderer',
      'liveChatPaidStickerRenderer',
      'live_chat_text_message_renderer',
      'live_chat_paid_message_renderer',
      'live_chat_membership_item_renderer',
      'live_chat_paid_sticker_renderer'
    ]) ||
    !!firstRecord(node, [
      'markChatItemAsDeletedAction',
      'removeChatItemAction',
      'markChatItemsByAuthorAsDeletedAction',
      'removeChatItemByAuthorAction',
      'mark_chat_item_as_deleted_action',
      'remove_chat_item_action',
      'mark_chat_items_by_author_as_deleted_action',
      'remove_chat_item_by_author_action'
    ])
  )
}

/**
 * A resposta que ativa a atividade inclui o histórico comum junto do histórico
 * de moderação. Mantém itens de chat e ações de estado de remoção na ordem
 * original, sem alterar o JSON recebido.
 */
export function onlyRawBootstrapChatItems(response: unknown): unknown {
  const root = record(response)
  if (!root) return response
  const continuationKey = record(root.continuationContents)
    ? 'continuationContents'
    : record(root.continuation_contents)
      ? 'continuation_contents'
      : null
  if (!continuationKey) return response

  const continuation = record(root[continuationKey])
  const liveKey = record(continuation?.liveChatContinuation)
    ? 'liveChatContinuation'
    : record(continuation?.live_chat_continuation)
      ? 'live_chat_continuation'
      : null
  if (!continuation || !liveKey) return response

  const live = record(continuation[liveKey])
  const actions = live?.actions
  if (!live || !Array.isArray(actions)) return response

  return {
    ...root,
    [continuationKey]: {
      ...continuation,
      [liveKey]: {
        ...live,
        actions: actions.filter(isRawBootstrapChatItem)
      }
    }
  }
}

export function extractRawLiveChatContinuation(response: unknown): string | null {
  const continuations = rawLiveChat(response)?.continuations
  if (!Array.isArray(continuations)) return null

  for (const item of continuations) {
    const data = firstRecord(item, [
      'timedContinuationData',
      'invalidationContinuationData',
      'reloadContinuationData',
      'timed_continuation_data',
      'invalidation_continuation_data',
      'reload_continuation_data'
    ])
    const token = data?.continuation
    if (typeof token === 'string' && token) return token
  }
  return null
}

function text(value: unknown, depth = 0): string {
  if (value == null || depth > 8) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map((part) => text(part, depth + 1)).join('')
  const node = record(value)
  if (!node) return ''
  if (typeof node.simpleText === 'string') return node.simpleText
  if (Array.isArray(node.runs)) {
    return node.runs.map((run) => text(run, depth + 1)).join('')
  }
  if (typeof node.text === 'string') return node.text
  return ''
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function isModerationLabel(value: unknown): boolean {
  const label = normalized(text(value))
  return label.includes('atividade de moderacao') || label.includes('moderation activity')
}

function findRawModerationToggle(response: unknown): AnyRecord | null {
  const live = rawLiveChat(response)
  const headerWrapper = record(live?.header)
  const header = firstRecord(headerWrapper, [
    'liveChatHeaderRenderer',
    'live_chat_header_renderer'
  ]) ?? headerWrapper
  const overflowWrapper = record(header?.overflowMenu ?? header?.overflow_menu)
  const menu = firstRecord(overflowWrapper, ['menuRenderer', 'menu_renderer'])
  const items = menu?.items
  if (!Array.isArray(items)) return null

  for (const item of items) {
    const toggle = firstRecord(item, [
      'toggleMenuServiceItemRenderer',
      'toggle_menu_service_item_renderer'
    ])
    if (!toggle) continue
    if (isModerationLabel(toggle.defaultText) || isModerationLabel(toggle.toggledText)) {
      return toggle
    }
  }
  return null
}

function moderationEnableContinuation(toggle: AnyRecord): string | null {
  const endpoint = record(toggle.defaultServiceEndpoint ?? toggle.default_service_endpoint)
  const command = firstRecord(endpoint, [
    'reloadLiveChatCommand',
    'reload_live_chat_command'
  ])
  const continuation = record(command?.continuation)
  const reload = firstRecord(continuation, [
    'reloadContinuationData',
    'reload_continuation_data'
  ])
  const token = reload?.continuation
  return typeof token === 'string' && token ? token : null
}

export async function activateModerationActivity(
  rawResponse: unknown,
  execute: InnertubeExecute,
  isReplay: boolean
): Promise<ModerationActivityActivation> {
  if (isReplay) return { status: 'skipped-replay' }

  const toggle = findRawModerationToggle(rawResponse)
  if (!toggle) return { status: 'unavailable' }

  if (toggle.isToggled === true || toggle.is_toggled === true) {
    const continuation = extractRawLiveChatContinuation(rawResponse)
    return continuation
      ? { status: 'already-active', continuation, bootstrapResponse: rawResponse }
      : { status: 'unavailable' }
  }

  const enableContinuation = moderationEnableContinuation(toggle)
  if (!enableContinuation) return { status: 'unavailable' }

  const response = await execute('live_chat/get_live_chat', {
    continuation: enableContinuation,
    parse: false,
    webClientInfo: { isDocumentHidden: false }
  })
  const data = record(response)?.data ?? response
  const continuation = extractRawLiveChatContinuation(data)
  return continuation
    ? { status: 'activated', continuation, bootstrapResponse: data }
    : { status: 'unavailable' }
}

function durationSeconds(value: string): number | undefined {
  const match = normalized(value).match(
    /(\d+)\s*(segundos?|seconds?|secs?|minutos?|minutes?|mins?|horas?|hours?|dias?|days?)/
  )
  if (!match) return undefined
  const amount = Number(match[1])
  const unit = match[2]
  if (/^(seg|sec)/.test(unit)) return amount
  if (/^min/.test(unit)) return amount * 60
  if (/^(hor|hour)/.test(unit)) return amount * 3600
  if (/^(dia|day)/.test(unit)) return amount * 86400
  return undefined
}

function moderationKind(value: string): IncomingModerationEvent['kind'] | null {
  const message = normalized(value)
  if (
    message.includes('message deleted') ||
    message.includes('deleted by') ||
    message.includes('mensagem apagada') ||
    message.includes('mensagem excluida')
  ) {
    return 'delete'
  }
  if (
    message.includes('pausado temporariamente') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('time out') ||
    message.includes('colocado em espera')
  ) {
    return 'timeout'
  }
  if (
    message.includes('ocultado neste canal') ||
    message.includes('ocultada neste canal') ||
    message.includes('foi ocultado por') ||
    message.includes('foi ocultada por') ||
    message.includes('hidden from this channel') ||
    message.includes('was hidden by') ||
    message.includes('banido') ||
    message.includes('banned')
  ) {
    return 'hide'
  }
  return null
}

function mentions(value: unknown): string[] {
  const node = record(value)
  const runs = node?.runs
  if (!Array.isArray(runs)) return []
  return runs
    .map((run) => text(run).trim())
    .filter((part) => part.startsWith('@'))
}

export function analyzeRawModerationActions(
  actions: unknown[]
): IncomingModerationEvent[] {
  const removals: Array<{ index: number; authorChannelId: string }> = []
  const deletedItems: Array<{ index: number; messageId: string }> = []
  const embeddedDeletes: IncomingModerationEvent[] = []
  const embeddedDeleteActionIndexes = new Set<number>()
  for (const [index, action] of actions.entries()) {
    const removal = firstRecord(action, [
      'markChatItemsByAuthorAsDeletedAction',
      'removeChatItemByAuthorAction',
      'mark_chat_items_by_author_as_deleted_action',
      'remove_chat_item_by_author_action'
    ])
    const authorId = removal?.externalChannelId ?? removal?.external_channel_id
    if (typeof authorId === 'string' && authorId) {
      removals.push({ index, authorChannelId: authorId })
    }

    const deletedItem = firstRecord(action, [
      'markChatItemAsDeletedAction',
      'removeChatItemAction',
      'mark_chat_item_as_deleted_action',
      'remove_chat_item_action'
    ])
    const messageId = deletedItem?.targetItemId ?? deletedItem?.target_item_id
    if (typeof messageId === 'string' && messageId) {
      deletedItems.push({ index, messageId })
      const stateNode =
        deletedItem?.deletedStateMessage ?? deletedItem?.deleted_state_message
      const stateText = text(stateNode).trim()
      if (stateText && moderationKind(stateText) === 'delete') {
        const event: IncomingModerationEvent = {
          kind: 'delete',
          text: stateText,
          messageId
        }
        const stateNames = mentions(stateNode)
        if (stateNames[0]) event.moderatorName = stateNames[0]
        embeddedDeletes.push(event)
        embeddedDeleteActionIndexes.add(index)
      }
    }
  }

  const usedRemovals = new Set<number>()
  const usedDeletedItems = new Set<number>()
  const events: IncomingModerationEvent[] = [...embeddedDeletes]

  for (const [actionIndex, action] of actions.entries()) {
    const node = record(action)
    if (!node) continue

    const add = firstRecord(node, ['addChatItemAction', 'add_chat_item_action'])
    const item = record(add?.item)
    const renderer = firstRecord(item, [
      'liveChatModerationMessageRenderer',
      'live_chat_moderation_message_renderer'
    ])
    if (!renderer) continue

    const messageNode = renderer.message ?? renderer.text ?? renderer.subtext
    const message = text(messageNode).trim()
    const kind = moderationKind(message)
    if (!message || !kind) continue
    if (
      kind === 'delete' &&
      deletedItems.some((item) =>
        embeddedDeleteActionIndexes.has(item.index) &&
        Math.abs(item.index - actionIndex) <= 4
      )
    ) continue

    const event: IncomingModerationEvent = { kind, text: message }
    if (typeof renderer.id === 'string' && renderer.id) event.rendererId = renderer.id

    const duration = durationSeconds(message)
    if (duration !== undefined) event.durationSeconds = duration

    const candidates = kind === 'delete' ? deletedItems : removals
    const usedCandidates = kind === 'delete' ? usedDeletedItems : usedRemovals
    const nearbyRemoval = candidates
      .map((removal, index) => ({ ...removal, removalIndex: index }))
      .filter(
        (removal) =>
          !usedCandidates.has(removal.removalIndex) &&
          Math.abs(removal.index - actionIndex) <= 4
      )
      .sort((left, right) => {
        const distance =
          Math.abs(left.index - actionIndex) - Math.abs(right.index - actionIndex)
        if (distance !== 0) return distance
        return Number(left.index < actionIndex) - Number(right.index < actionIndex)
      })[0]
    if (nearbyRemoval) {
      usedCandidates.add(nearbyRemoval.removalIndex)
      if ('authorChannelId' in nearbyRemoval) {
        event.authorChannelId = nearbyRemoval.authorChannelId
      } else {
        event.messageId = nearbyRemoval.messageId
      }
    }

    const names = mentions(messageNode)
    if (names[0]) event.targetName = names[0]
    if (names[1]) event.moderatorName = names[1]

    const timestampNumber = Number(renderer.timestampUsec ?? renderer.timestamp_usec)
    if (Number.isFinite(timestampNumber)) {
      event.timestamp = Math.floor(timestampNumber / 1_000)
    }
    events.push(event)
  }

  return events
}

type LocalModeration = {
  videoId: string
  kind: IncomingModerationEvent['kind']
  authorChannelId?: string
  targetName?: string
  at: number
}

export class ModerationEchoSuppressor {
  private readonly local: LocalModeration[] = []
  private readonly seenRendererIds = new Set<string>()
  private readonly ttlMs: number

  constructor(ttlMs = 30_000) {
    this.ttlMs = ttlMs
  }

  rememberLocal(event: LocalModeration): void {
    this.local.push(event)
  }

  shouldSuppress(
    videoId: string,
    event: IncomingModerationEvent,
    now = Date.now()
  ): boolean {
    if (event.rendererId) {
      if (this.seenRendererIds.has(event.rendererId)) return true
      this.seenRendererIds.add(event.rendererId)
      if (this.seenRendererIds.size > 2_000) {
        const oldest = this.seenRendererIds.values().next().value
        if (oldest) this.seenRendererIds.delete(oldest)
      }
    }

    for (let index = this.local.length - 1; index >= 0; index--) {
      if (now - this.local[index].at > this.ttlMs) this.local.splice(index, 1)
    }

    const eventName = normalized(event.targetName || '')
    const index = this.local.findIndex((local) => {
      if (local.videoId !== videoId || local.kind !== event.kind) return false
      if (
        local.authorChannelId &&
        event.authorChannelId &&
        local.authorChannelId === event.authorChannelId
      ) {
        return true
      }
      const localName = normalized(local.targetName || '')
      return !!localName && !!eventName && localName === eventName
    })

    if (index < 0) return false
    this.local.splice(index, 1)
    return true
  }
}
