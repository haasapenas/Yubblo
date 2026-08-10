/**
 * YouTube Live Chat — mensagens retidas (AutoMod / held for review).
 *
 * Item: liveChatAutoModMessageRenderer / LiveChatAutoModMessage
 * Botões: Mostrar (show) · Ocultar (hide) via live_chat/moderate
 *
 * Módulo isolado: parse + classificação. Execução fica no chat-service
 * (cache de endpoints + yt.actions.execute).
 */
import type { ChatMessage } from '../../shared/types'
import {
  extractMenuParamsFromItem,
  findModerateEndpoint,
  textOf,
  type RawModEndpoint
} from './moderation-parser'

/** iconType estável no modEndpointCache / UI */
export const AUTOMOD_SHOW_ICON = 'AUTOMOD_SHOW'
export const AUTOMOD_HIDE_ICON = 'AUTOMOD_HIDE'

export type AutomodButtonAction = 'show' | 'hide'

export type AutomodHeldParseResult = {
  message: ChatMessage
  endpoints: RawModEndpoint[]
  /** Renderer interno que carrega o contextMenuEndpoint de timeout/ban. */
  moderatableItem?: unknown
}

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

function firstRecord(
  v: unknown,
  keys: string[]
): Record<string, unknown> | null {
  const o = record(v)
  if (!o) return null
  for (const k of keys) {
    const r = record(o[k])
    if (r) return r
  }
  return null
}

/** Classifica botão do AutoMod (PT/EN). Não confundir com hide de usuário. */
export function classifyAutomodButton(
  label: string,
  iconType = ''
): AutomodButtonAction | null {
  const s = `${label} ${iconType}`.toUpperCase()
  if (!s.trim()) return null

  // Ocultar / rejeitar a mensagem retida
  if (
    s.includes('KEEP_OUT') ||
    s.includes('NOT_INTERESTED') ||
    s.includes('REJECT') ||
    s.includes('DISMISS') ||
    s.includes('DONT SHOW') ||
    s.includes("DON'T SHOW") ||
    s.includes('DO NOT SHOW') ||
    s.includes('HIDE MESSAGE') ||
    s.includes('HIDE THIS') ||
    (s.includes('HIDE') && !s.includes('UNHIDE') && !s.includes('SHOW')) ||
    s.includes('OCULTAR MENS') ||
    s.includes('OCULTAR ESTA') ||
    s.includes('REJEIT') ||
    s.includes('NÃO MOSTRAR') ||
    s.includes('NAO MOSTRAR') ||
    s.includes('NÃO EXIBIR') ||
    s.includes('NAO EXIBIR') ||
    (s.includes('OCULT') && !s.includes('DESOCULT') && !s.includes('USU'))
  ) {
    // "Ocultar usuário" não é automod de mensagem
    if (
      s.includes('USER') ||
      s.includes('USUÁR') ||
      s.includes('USUAR') ||
      s.includes('UTILIZ') ||
      s.includes('CHANNEL') ||
      s.includes('CANAL')
    ) {
      return null
    }
    return 'hide'
  }

  // Mostrar / aprovar / Exibir (label do site em PT)
  if (
    s.includes('CHECK') ||
    s.includes('APPROVE') ||
    s.includes('ALLOW') ||
    s.includes('SHOW MESSAGE') ||
    s.includes('SHOW THIS') ||
    s.includes('SHOW CHAT') ||
    (s.includes('SHOW') && !s.includes('SHOWCASE')) ||
    s.includes('MOSTRAR MENS') ||
    s.includes('MOSTRAR ESTA') ||
    s.includes('EXIBIR MENS') ||
    s.includes('APROV') ||
    s.includes('PERMITIR') ||
    // "Exibir" sozinho (screenshot YT PT) — não "Não exibir" / "Exibir usuário"
    (/^\s*EXIBIR\s*$/i.test(label) ||
      (s.includes('EXIBIR') &&
        !s.includes('NAO') &&
        !s.includes('NÃO') &&
        !s.includes('USU') &&
        !s.includes('UTILIZ') &&
        !s.includes('CANAL'))) ||
    (s.includes('MOSTRAR') && !s.includes('USU') && !s.includes('UTILIZ'))
  ) {
    return 'show'
  }

  return null
}

export function isAutomodHeldItem(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false
  const o = item as { type?: string }
  if (
    o.type === 'LiveChatAutoModMessage' ||
    /AutoMod/i.test(String(o.type || ''))
  ) {
    return true
  }
  // Renderer cru (antes do Parser) ou wrapper
  return !!(
    firstRecord(item, [
      'liveChatAutoModMessageRenderer',
      'live_chat_auto_mod_message_renderer'
    ]) ||
    (record(item)?.auto_moderated_item != null ||
      record(item)?.autoModeratedItem != null ||
      record(item)?.moderation_buttons != null ||
      record(item)?.moderationButtons != null)
  )
}

function unwrapRenderer(item: unknown): Record<string, unknown> | null {
  const nested = firstRecord(item, [
    'liveChatAutoModMessageRenderer',
    'live_chat_auto_mod_message_renderer'
  ])
  if (nested) return nested
  return record(item)
}

function nestedTextMessage(
  autoItem: unknown
): Record<string, unknown> | null {
  if (!autoItem) return null
  // YTNode parsed
  const asNode = autoItem as { type?: string; author?: unknown; message?: unknown; id?: string }
  if (asNode.type === 'LiveChatTextMessage' || asNode.author || asNode.message) {
    return record(autoItem)
  }
  const wrapped = firstRecord(autoItem, [
    'liveChatTextMessageRenderer',
    'live_chat_text_message_renderer',
    'liveChatPaidMessageRenderer',
    'live_chat_paid_message_renderer'
  ])
  if (wrapped) return wrapped
  // Parser: auto_moderated_item may be YTNode with .type
  return record(autoItem)
}

function authorFrom(nested: Record<string, unknown> | null): {
  name: string
  channelId?: string
  avatarUrl?: string
} {
  if (!nested) return { name: 'Alguém' }
  const author = record(nested.author)
  // Renderer cru: authorName / authorExternalChannelId
  const name =
    textOf(author?.name) ||
    textOf(nested.authorName) ||
    textOf(nested.author_name) ||
    textOf(author?.simpleText) ||
    'Alguém'
  const channelId =
    (typeof author?.id === 'string' && author.id) ||
    (typeof author?.channelId === 'string' && author.channelId) ||
    (typeof nested.authorExternalChannelId === 'string'
      ? nested.authorExternalChannelId
      : undefined) ||
    (typeof nested.author_external_channel_id === 'string'
      ? nested.author_external_channel_id
      : undefined) ||
    undefined
  let avatarUrl: string | undefined
  const thumbs =
    author?.best_thumbnail ||
    author?.thumbnails ||
    nested.authorPhoto ||
    nested.author_photo
  if (thumbs && typeof thumbs === 'object' && !Array.isArray(thumbs)) {
    const t = thumbs as { url?: string; thumbnails?: Array<{ url?: string }> }
    avatarUrl =
      t.url ||
      t.thumbnails?.[0]?.url ||
      undefined
  } else if (Array.isArray(thumbs) && thumbs[0]) {
    avatarUrl = String((thumbs[0] as { url?: string }).url || '') || undefined
  }
  return { name: name || 'Alguém', channelId, avatarUrl }
}

function messageTextFrom(nested: Record<string, unknown> | null): string {
  if (!nested) return ''
  return (
    textOf(nested.message) ||
    textOf(nested.text) ||
    textOf((nested as { message?: unknown }).message) ||
    ''
  )
}

type ButtonLike = {
  text?: unknown
  label?: string
  tooltip?: string
  icon_type?: string
  iconType?: string
  endpoint?: {
    name?: string
    payload?: Record<string, unknown>
    metadata?: { api_url?: string }
  }
  serviceEndpoint?: unknown
  navigationEndpoint?: unknown
  command?: unknown
}

function iterButtons(raw: unknown): ButtonLike[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.flatMap((b) => {
      const r = record(b)
      if (!r) return []
      const br =
        firstRecord(r, ['buttonRenderer', 'button_renderer']) || r
      return [br as ButtonLike]
    })
  }
  // ObservedArray / iterable
  try {
    return [...(raw as Iterable<unknown>)].flatMap((b) => {
      if (!b || typeof b !== 'object') return []
      return [b as ButtonLike]
    })
  } catch {
    return []
  }
}

function endpointFromButton(btn: ButtonLike): {
  apiUrl: string
  body: Record<string, unknown>
} | null {
  // youtubei Button.endpoint
  if (btn.endpoint?.metadata?.api_url || btn.endpoint?.payload) {
    const api =
      btn.endpoint.metadata?.api_url ||
      (btn.endpoint.name?.includes('oderate') ? 'live_chat/moderate' : '')
    const body = { ...(btn.endpoint.payload || {}) }
    if (api && (body.params != null || Object.keys(body).length > 0)) {
      return {
        apiUrl: api.replace(/^\/youtubei\/v1\//, '').replace(/^\//, ''),
        body
      }
    }
  }
  // raw serviceEndpoint
  const rawEp =
    btn.serviceEndpoint || btn.navigationEndpoint || btn.command || btn.endpoint
  const found = findModerateEndpoint(rawEp)
  if (found) return found
  return findModerateEndpoint(btn)
}

/**
 * Extrai endpoints show/hide dos botões de moderação do AutoMod.
 */
export function extractAutomodEndpoints(buttons: unknown): RawModEndpoint[] {
  const out: RawModEndpoint[] = []
  const seen = new Set<string>()

  for (const btn of iterButtons(buttons)) {
    const label =
      textOf(btn.text) ||
      btn.label ||
      btn.tooltip ||
      textOf((btn as { accessibility?: { label?: string } }).accessibility?.label) ||
      ''
    const iconType =
      btn.icon_type ||
      btn.iconType ||
      (record((btn as { icon?: unknown }).icon)?.iconType as string) ||
      ''
    const action = classifyAutomodButton(label, String(iconType || ''))
    if (!action) continue
    const ep = endpointFromButton(btn)
    if (!ep?.body?.params && !ep?.body) continue
    if (!ep) continue

    const stableIcon =
      action === 'show' ? AUTOMOD_SHOW_ICON : AUTOMOD_HIDE_ICON
    if (seen.has(stableIcon)) continue
    seen.add(stableIcon)

    out.push({
      apiUrl: ep.apiUrl.includes('moderate')
        ? ep.apiUrl.replace(/^\/+/, '')
        : 'live_chat/moderate',
      body: ep.body,
      label:
        label ||
        (action === 'show' ? 'Mostrar' : 'Ocultar'),
      iconType: stableIcon,
      kind: 'other'
    })
  }
  return out
}

/**
 * Converte item AutoMod (YTNode ou JSON) → ChatMessage + endpoints.
 */
export function parseAutomodHeldItem(
  item: unknown
): AutomodHeldParseResult | null {
  if (!isAutomodHeldItem(item)) return null
  const root = unwrapRenderer(item)
  if (!root) return null

  const id =
    (typeof root.id === 'string' && root.id) ||
    `automod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const header =
    textOf(root.header_text) ||
    textOf(root.headerText) ||
    textOf((root as { header_text?: unknown }).header_text) ||
    'Retido para revisão'

  const autoItem =
    root.auto_moderated_item ??
    root.autoModeratedItem ??
    (root as { auto_moderated_item?: unknown }).auto_moderated_item

  const nested = nestedTextMessage(autoItem)
  const author = authorFrom(nested)
  const text = messageTextFrom(nested) || '(mensagem retida)'

  const buttons =
    root.moderation_buttons ??
    root.moderationButtons ??
    (root as { moderation_buttons?: unknown }).moderation_buttons

  const endpoints = extractAutomodEndpoints(buttons)
  const heldActions = endpoints.map((ep) => ({
    iconType: ep.iconType,
    label: ep.label,
    action:
      ep.iconType === AUTOMOD_SHOW_ICON
        ? ('show' as const)
        : ('hide' as const)
  }))

  const tsRaw = root.timestamp_usec ?? root.timestampUsec ?? root.timestamp
  let timestamp = Date.now()
  if (typeof tsRaw === 'number' && Number.isFinite(tsRaw)) {
    timestamp = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw
  } else if (typeof tsRaw === 'string' && /^\d+$/.test(tsRaw)) {
    const n = Number(tsRaw)
    timestamp = n > 1e12 ? Math.floor(n / 1000) : n
  }

  const message: ChatMessage = {
    id,
    authorName: author.name,
    authorChannelId: author.channelId,
    authorAvatarUrl: author.avatarUrl,
    text,
    parts: [{ type: 'text', text }],
    timestamp,
    heldForReview: true,
    heldHeader: header,
    heldActions: heldActions.length ? heldActions : undefined,
    hasContextMenu: false
  }

  return {
    message,
    endpoints,
    moderatableItem: nested || undefined
  }
}

export function isAutomodIconType(iconType: string): boolean {
  return (
    iconType === AUTOMOD_SHOW_ICON ||
    iconType === AUTOMOD_HIDE_ICON ||
    iconType.startsWith('AUTOMOD_')
  )
}

/**
 * Resposta de live_chat/moderate (Exibir): às vezes já traz a msg publicada
 * com contextMenuEndpoint — necessária p/ timeout/delete depois.
 */
export type ReleasedChatItemFromModerate = {
  /** id real no chat (não o id do card AutoMod) */
  id: string
  authorName: string
  authorChannelId?: string
  text: string
  timestamp: number
  /** item cru p/ itemStore / get_item_context_menu */
  rawItem: Record<string, unknown>
  hasContextMenu: boolean
}

function parseTextRendererRelease(
  textRenderer: Record<string, unknown>,
  itemWrap: Record<string, unknown> | null
): ReleasedChatItemFromModerate | null {
  const id = (typeof textRenderer.id === 'string' && textRenderer.id) || ''
  const author = authorFrom(textRenderer)
  const text = messageTextFrom(textRenderer)
  if (!id || !text) return null

  const tsRaw =
    textRenderer.timestampUsec ||
    textRenderer.timestamp_usec ||
    textRenderer.timestamp
  let timestamp = Date.now()
  if (typeof tsRaw === 'number' && Number.isFinite(tsRaw)) {
    timestamp = tsRaw > 1e12 ? Math.floor(tsRaw / 1000) : tsRaw
  } else if (typeof tsRaw === 'string' && /^\d+$/.test(tsRaw)) {
    const n = Number(tsRaw)
    timestamp = n > 1e12 ? Math.floor(n / 1000) : n
  }

  const rawItem =
    itemWrap &&
    firstRecord(itemWrap, [
      'liveChatTextMessageRenderer',
      'live_chat_text_message_renderer'
    ])
      ? itemWrap
      : textRenderer

  const menuParams =
    extractMenuParamsFromItem(rawItem) || extractMenuParamsFromItem(textRenderer)

  return {
    id,
    authorName: author.name,
    authorChannelId: author.channelId,
    text,
    timestamp,
    rawItem,
    hasContextMenu: !!menuParams
  }
}

/**
 * Varre resposta de moderate / get_live_chat por liveChatTextMessageRenderer
 * com menu (ou sem — caller completa depois).
 * Prefere item COM contextMenu; se só houver sem menu, devolve o primeiro texto.
 */
export function extractReleasedChatItemFromModerateResponse(
  data: unknown
): ReleasedChatItemFromModerate | null {
  if (!data) return null
  let withMenu: ReleasedChatItemFromModerate | null = null
  let anyText: ReleasedChatItemFromModerate | null = null

  const consider = (
    textRenderer: Record<string, unknown>,
    itemWrap: Record<string, unknown> | null
  ): void => {
    // ignora AutoMod wrapper
    if (
      firstRecord(itemWrap || textRenderer, [
        'liveChatAutoModMessageRenderer',
        'live_chat_auto_mod_message_renderer'
      ])
    ) {
      return
    }
    const parsed = parseTextRendererRelease(textRenderer, itemWrap)
    if (!parsed) return
    if (parsed.hasContextMenu) {
      if (!withMenu) withMenu = parsed
    } else if (!anyText) {
      anyText = parsed
    }
  }

  const visit = (node: unknown, depth: number): void => {
    if (withMenu || !node || depth > 16) return
    if (Array.isArray(node)) {
      for (const x of node) visit(x, depth + 1)
      return
    }
    const o = record(node)
    if (!o) return

    // replaceChatItemAction (Exibir costuma SUBSTITUIR o card AutoMod pelo texto)
    const replace = firstRecord(o, [
      'replaceChatItemAction',
      'replace_chat_item_action'
    ])
    if (replace) {
      const rep =
        record(replace.replacementItem) ||
        record(replace.replacement_item) ||
        firstRecord(replace, ['replacementItem', 'replacement_item'])
      if (rep) {
        const tr = firstRecord(rep, [
          'liveChatTextMessageRenderer',
          'live_chat_text_message_renderer'
        ])
        if (tr) consider(tr, rep)
      }
    }

    // addChatItemAction.item.liveChatTextMessageRenderer
    const add = firstRecord(o, ['addChatItemAction', 'add_chat_item_action'])
    const itemWrap = add ? record(add.item) || firstRecord(add, ['item']) : null
    const textRenderer =
      (itemWrap &&
        firstRecord(itemWrap, [
          'liveChatTextMessageRenderer',
          'live_chat_text_message_renderer'
        ])) ||
      firstRecord(o, [
        'liveChatTextMessageRenderer',
        'live_chat_text_message_renderer'
      ])

    if (textRenderer) {
      consider(textRenderer, itemWrap)
    }

    for (const [k, v] of Object.entries(o)) {
      if (k === 'loggingDirectives' || k === 'trackingParams') continue
      if (v && typeof v === 'object') visit(v, depth + 1)
    }
  }

  visit(data, 0)
  return withMenu || anyText
}

/**
 * Procura num get_live_chat inteiro a msg (por id ou texto) COM params de menu.
 */
export function findChatItemWithMenuInResponse(
  data: unknown,
  opts: { messageId?: string; text?: string }
): ReleasedChatItemFromModerate | null {
  if (!data) return null
  let found: ReleasedChatItemFromModerate | null = null
  const wantText = (opts.text || '').trim()

  const visit = (node: unknown, depth: number): void => {
    if (found || !node || depth > 16) return
    if (Array.isArray(node)) {
      for (const x of node) visit(x, depth + 1)
      return
    }
    const o = record(node)
    if (!o) return

    const tr = firstRecord(o, [
      'liveChatTextMessageRenderer',
      'live_chat_text_message_renderer'
    ])
    if (tr) {
      const id = typeof tr.id === 'string' ? tr.id : ''
      const text = messageTextFrom(tr)
      const idMatch = opts.messageId && id === opts.messageId
      const textMatch = wantText && text === wantText
      if (idMatch || textMatch) {
        const menuParams = extractMenuParamsFromItem(tr) || extractMenuParamsFromItem(o)
        if (menuParams) {
          const parsed = parseTextRendererRelease(tr, o)
          if (parsed) {
            found = { ...parsed, hasContextMenu: true, rawItem: tr }
            return
          }
        }
      }
    }

    for (const [k, v] of Object.entries(o)) {
      if (k === 'loggingDirectives' || k === 'trackingParams') continue
      if (v && typeof v === 'object') visit(v, depth + 1)
    }
  }

  visit(data, 0)
  return found
}

/** Uma action crua é AutoMod (retida)? */
export function isRawAutomodAction(action: unknown): boolean {
  return extractRawAutomodHeldFromSingleAction(action) != null
}

/** Extrai no máx. 1 retida desta action (sem varrer irmãos). */
export function extractRawAutomodHeldFromSingleAction(
  action: unknown
): AutomodHeldParseResult | null {
  const node = record(action)
  if (!node) return null

  const add =
    firstRecord(node, ['addChatItemAction', 'add_chat_item_action']) || node
  const item = record(add.item) || firstRecord(add, ['item'])
  if (item) {
    const renderer = firstRecord(item, [
      'liveChatAutoModMessageRenderer',
      'live_chat_auto_mod_message_renderer'
    ])
    if (renderer) {
      return parseAutomodHeldItem({
        liveChatAutoModMessageRenderer: renderer
      })
    }
    if (isAutomodHeldItem(item)) {
      return parseAutomodHeldItem(item)
    }
  }
  return null
}

/**
 * Extrai mensagens retidas do JSON cru de get_live_chat (actions[]).
 * Não depende do Parser do youtubei — o parse tipado às vezes perde o AutoMod.
 * Mantém a ordem das actions (igual ao feed do YT).
 */
export function extractRawAutomodHeldFromActions(
  actions: unknown[]
): AutomodHeldParseResult[] {
  const out: AutomodHeldParseResult[] = []
  const seen = new Set<string>()

  for (const action of actions) {
    const parsed = extractRawAutomodHeldFromSingleAction(action)
    if (!parsed) continue
    if (seen.has(parsed.message.id)) continue
    seen.add(parsed.message.id)
    out.push(parsed)
  }

  return out
}

/**
 * Action já parseada pelo youtubei é AutoMod?
 * (p/ não emitir 2x quando o Parser também entende o item)
 */
export function isParsedAutomodAction(action: unknown): boolean {
  if (!action || typeof action !== 'object') return false
  const a = action as { type?: string; item?: unknown }
  if (a.type === 'LiveChatAutoModMessage' || /AutoMod/i.test(String(a.type || ''))) {
    return true
  }
  if (a.item && isAutomodHeldItem(a.item)) return true
  const item = a.item as { type?: string } | undefined
  if (item && (/AutoMod/i.test(String(item.type || '')) || item.type === 'LiveChatAutoModMessage')) {
    return true
  }
  return false
}

/** Varre a árvore por liveChatAutoModMessageRenderer (qualquer profundidade). */
function walkAutomodRenderers(
  node: unknown,
  depth: number,
  onHit: (renderer: Record<string, unknown>) => void
): void {
  if (!node || depth > 14) return
  if (Array.isArray(node)) {
    for (const x of node) walkAutomodRenderers(x, depth + 1, onHit)
    return
  }
  const o = record(node)
  if (!o) return
  for (const key of [
    'liveChatAutoModMessageRenderer',
    'live_chat_auto_mod_message_renderer'
  ]) {
    const r = record(o[key])
    if (r) onHit(r)
  }
  for (const [k, v] of Object.entries(o)) {
    if (k === 'loggingDirectives' || k === 'trackingParams') continue
    if (v && typeof v === 'object') walkAutomodRenderers(v, depth + 1, onHit)
  }
}

/** Atalho: response inteiro de get_live_chat ou lista de actions */
export function extractRawAutomodHeldFromResponse(
  response: unknown
): AutomodHeldParseResult[] {
  if (Array.isArray(response)) {
    return extractRawAutomodHeldFromActions(response)
  }
  const root = record(response)
  if (!root) return []

  // 1) Caminho normal: continuation actions
  const cont =
    firstRecord(root, ['continuationContents', 'continuation_contents']) || null
  const live = cont
    ? firstRecord(cont, ['liveChatContinuation', 'live_chat_continuation'])
    : null
  const actions = live?.actions
  if (Array.isArray(actions) && actions.length > 0) {
    const fromActions = extractRawAutomodHeldFromActions(actions)
    if (fromActions.length > 0) return fromActions
  }

  // 2) Fallback: varre a resposta inteira (layouts alternativos do YT)
  const out: AutomodHeldParseResult[] = []
  const seen = new Set<string>()
  walkAutomodRenderers(response, 0, (renderer) => {
    const parsed = parseAutomodHeldItem({
      liveChatAutoModMessageRenderer: renderer
    })
    if (!parsed || seen.has(parsed.message.id)) return
    seen.add(parsed.message.id)
    out.push(parsed)
  })
  return out
}
