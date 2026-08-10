/**
 * Moderação via endpoints InnerTube em JSON cru (parse:false).
 * Não usa ItemMenu/NavigationEndpoint.call (quebra em timeout/dialog).
 */
import type { ModActionKind, ModMenuAction } from '../../shared/types'

export function textOf(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const o = value as {
      text?: string
      simpleText?: string
      runs?: Array<{ text?: string }>
      toString?: () => string
    }
    if (typeof o.simpleText === 'string') return o.simpleText
    if (typeof o.text === 'string') return o.text
    if (Array.isArray(o.runs)) return o.runs.map((r) => r.text || '').join('')
    if (typeof o.toString === 'function') {
      const s = o.toString()
      if (s && s !== '[object Object]') return s
    }
  }
  return String(value)
}

/**
 * Ações do menu do viewer comum (não são moderação do canal).
 * Antes "Bloquear usuário" virava hide → canModerate=true p/ todo mundo.
 */
export function isPersonalViewerAction(label: string, iconType: string): boolean {
  const s = `${label} ${iconType}`.toUpperCase()
  const icon = iconType.toUpperCase()
  if (
    s.includes('REPORT') ||
    s.includes('DENUNCI') ||
    s.includes('FLAG') ||
    icon.includes('REPORT') ||
    icon.includes('FLAG') ||
    s.includes('GET_REPORT') ||
    s.includes('FEEDBACK')
  ) {
    return true
  }
  // Bloquear usuário (conta) ≠ ocultar do chat do canal (mod)
  if (
    s.includes('BLOCK USER') ||
    s.includes('BLOQUEAR USU') ||
    s.includes('BLOQUEAR O USU') ||
    s.includes('BLOQUEAR UTILIZ') ||
    s.includes('BLOCK THIS') ||
    (icon.includes('BLOCK') && !icon.includes('KEEP_OUT') && !s.includes('TIMEOUT'))
  ) {
    // Timeout / ban temporário do chat não é block pessoal
    if (
      s.includes('TIMEOUT') ||
      s.includes('TEMPOR') ||
      s.includes('HOURGLASS') ||
      s.includes('KEEP_OUT') ||
      s.includes('NESTE CANAL') ||
      s.includes('THIS CHANNEL') ||
      s.includes('FROM THIS')
    ) {
      return false
    }
    return true
  }
  // "Ban" genérico sem contexto de canal/chat costuma ser UI de conta
  if (
    (s.includes('BLOCK') || icon.includes('BLOCK')) &&
    !s.includes('CANAL') &&
    !s.includes('CHANNEL') &&
    !s.includes('CHAT') &&
    !s.includes('HIDE') &&
    !s.includes('OCULT') &&
    !s.includes('KEEP_OUT')
  ) {
    return true
  }
  return false
}

/** API real de moderação do live chat (não report/block/feedback). */
export function isLiveChatModerateApi(apiUrl: string): boolean {
  const u = (apiUrl || '').toLowerCase().replace(/\\/g, '/')
  return (
    u.includes('live_chat/moderate') ||
    u.includes('moderatelivechat') ||
    u.includes('livechatmoderate')
  )
}

export function classifyModAction(label: string, iconType: string): ModActionKind {
  const s = `${label} ${iconType}`.toUpperCase()
  const icon = iconType.toUpperCase()

  // Viewer comum: report / block → nunca conta como mod
  if (isPersonalViewerAction(label, iconType)) {
    return 'other'
  }

  // Desocultar ANTES de hide.
  // PT: "Voltar a exibir o usuário neste canal" (tem "o" entre exibir e usuário)
  if (
    s.includes('UNHIDE') ||
    s.includes('UN-HIDE') ||
    s.includes('SHOW USER') ||
    s.includes('SHOW THIS') ||
    s.includes('SHOW THIS USER') ||
    s.includes('DESOCULT') ||
    s.includes('REEXIB') ||
    s.includes('VOLTAR A EXIBIR') ||
    s.includes('VOLTAR EXIBIR') ||
    s.includes('EXIBIR O USU') ||
    s.includes('EXIBIR USU') ||
    s.includes('EXIBIR O UTILIZ') ||
    s.includes('EXIBIR UTILIZ') ||
    s.includes('EXIBIR NESTE') ||
    s.includes('EXIBIR NO CANAL') ||
    (s.includes('NESTE CANAL') && s.includes('EXIBIR')) ||
    s.includes('MOSTRAR USU') ||
    s.includes('MOSTRAR O USU') ||
    s.includes('MOSTRAR UTILIZ') ||
    s.includes('MOSTRAR O UTILIZ') ||
    s.includes('MOSTRAR ESTE') ||
    s.includes('UNBAN') ||
    s.includes('UNBLOCK') ||
    s.includes('REMOVER OCULT') ||
    s.includes('PARAR DE OCULT') ||
    s.includes('UNDO HIDE') ||
    (s.includes('DESFAZER') && (s.includes('OCULT') || s.includes('HIDE'))) ||
    icon.includes('UNHIDE') ||
    // SHOW sozinho é genérico demais; exige contexto de usuário/canal
    (icon.includes('SHOW') &&
      !icon.includes('SHOWCASE') &&
      (s.includes('USER') ||
        s.includes('USU') ||
        s.includes('UTILIZ') ||
        s.includes('CANAL') ||
        s.includes('CHANNEL') ||
        s.includes('CHAT')))
  ) {
    return 'unhide'
  }
  if (
    s.includes('DELETE') ||
    s.includes('APAGAR') ||
    s.includes('EXCLUIR') ||
    (s.includes('REMOVER') && (s.includes('MENS') || s.includes('MESSAGE'))) ||
    icon.includes('DELETE')
  ) {
    return 'delete'
  }
  if (
    s.includes('TIMEOUT') ||
    s.includes('TIMER') ||
    s.includes('SUSPEND') ||
    s.includes('TEMPOR') ||
    s.includes('BLOQUEIO TEMP') ||
    s.includes('PUT USER') ||
    s.includes('COLOCAR EM') ||
    s.includes('HOURGLASS') ||
    icon.includes('TIMER') ||
    icon.includes('TIMEOUT') ||
    icon.includes('HOURGLASS')
  ) {
    return 'timeout'
  }
  // Hide de MOD: ocultar do canal/chat — NÃO "bloquear usuário" (viewer)
  if (
    icon.includes('KEEP_OUT') ||
    s.includes('KEEP_OUT') ||
    s.includes('HIDE USER FROM') ||
    s.includes('FROM THIS CHANNEL') ||
    s.includes('HIDE FROM THIS') ||
    (s.includes('OCULT') &&
      (s.includes('NESTE CANAL') ||
        s.includes('NO CANAL') ||
        s.includes('USU') ||
        s.includes('UTILIZ') ||
        s.includes('CHAT'))) ||
    (s.includes('HIDE') &&
      (s.includes('CHANNEL') || s.includes('CHAT') || s.includes('USER'))) ||
    (s.includes('ESCONDER') && (s.includes('USU') || s.includes('CANAL'))) ||
    (icon.includes('HIDE') && !icon.includes('BLOCK'))
  ) {
    if (s.includes('EXIBIR') || s.includes('VOLTAR') || s.includes('MOSTRAR')) {
      return 'other'
    }
    return 'hide'
  }
  return 'other'
}

/** Endpoint/ação confirma poder de mod no canal (não menu pessoal). */
export function isConfirmedModEndpoint(ep: {
  kind: ModActionKind
  apiUrl?: string
  iconType?: string
  label?: string
}): boolean {
  if (!isModerationKind(ep.kind)) return false
  if (isPersonalViewerAction(ep.label || '', ep.iconType || '')) return false
  const api = ep.apiUrl || ''
  if (isLiveChatModerateApi(api)) return true
  // Placeholder de menu de duração (só existe se o YT ofereceu timeout de mod)
  const icon = (ep.iconType || '').toUpperCase()
  if (ep.kind === 'timeout' && (icon === 'TIMEOUT_MENU' || icon.startsWith('TIMEOUT_'))) {
    return true
  }
  return false
}

export function isModerationKind(kind: ModActionKind): boolean {
  return (
    kind === 'delete' ||
    kind === 'timeout' ||
    kind === 'hide' ||
    kind === 'unhide'
  )
}

export function preferredModActions(actions: ModMenuAction[]): ModMenuAction[] {
  const mods = actions.filter((a) => isModerationKind(a.kind))
  return mods.length > 0 ? mods : actions
}

export type RawModEndpoint = {
  apiUrl: string
  body: Record<string, unknown>
  label: string
  iconType: string
  kind: ModActionKind
}

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl
    .replace(/^https?:\/\/www\.youtube\.com\/youtubei\/v1\//, '')
    .replace(/^\/youtubei\/v1\//, '')
    .replace(/^\//, '')
}

function guessApiFromKey(key: string): string | null {
  const map: Record<string, string> = {
    moderateLiveChatEndpoint: 'live_chat/moderate',
    liveChatItemContextMenuEndpoint: 'live_chat/get_item_context_menu',
    getReportFormEndpoint: 'flag/get_form',
    feedbackEndpoint: 'feedback',
    liveChatModerateEndpoint: 'live_chat/moderate'
  }
  return map[key] || null
}

/**
 * Acha moderateLiveChatEndpoint (ou similar) com params no JSON.
 */
export function findModerateEndpoint(
  node: unknown,
  depth = 0
): { apiUrl: string; body: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object' || depth > 16) return null
  const o = node as Record<string, unknown>

  for (const key of [
    'moderateLiveChatEndpoint',
    'liveChatModerateEndpoint',
    'moderatelivechatEndpoint'
  ]) {
    if (o[key] && typeof o[key] === 'object') {
      const payload = o[key] as Record<string, unknown>
      const meta = (o.commandMetadata as { webCommandMetadata?: { apiUrl?: string } })
        ?.webCommandMetadata
      return {
        apiUrl: normalizeApiUrl(meta?.apiUrl || 'live_chat/moderate'),
        body: { ...payload }
      }
    }
  }

  // Wrapper serviceEndpoint
  if (o.serviceEndpoint) {
    const found = findModerateEndpoint(o.serviceEndpoint, depth + 1)
    if (found) return found
  }
  if (o.submitEndpoint) {
    const found = findModerateEndpoint(o.submitEndpoint, depth + 1)
    if (found) return found
  }
  if (o.commandMetadata && o.params) {
    const meta = (o.commandMetadata as { webCommandMetadata?: { apiUrl?: string } })
      .webCommandMetadata
    if (meta?.apiUrl?.includes('moderate')) {
      return {
        apiUrl: normalizeApiUrl(meta.apiUrl),
        body: { params: o.params }
      }
    }
  }

  for (const val of Object.values(o)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        const found = findModerateEndpoint(item, depth + 1)
        if (found) return found
      }
    } else if (val && typeof val === 'object') {
      const found = findModerateEndpoint(val, depth + 1)
      if (found) return found
    }
  }
  return null
}

function findAnyExecutable(
  node: unknown,
  depth = 0
): { apiUrl: string; body: Record<string, unknown> } | null {
  const moderate = findModerateEndpoint(node, depth)
  if (moderate) return moderate
  if (!node || typeof node !== 'object' || depth > 12) return null
  const o = node as Record<string, unknown>

  if (o.serviceEndpoint) return findAnyExecutable(o.serviceEndpoint, depth + 1)
  if (o.submitEndpoint) return findAnyExecutable(o.submitEndpoint, depth + 1)

  for (const [key, val] of Object.entries(o)) {
    if (!val || typeof val !== 'object') continue
    if (!key.endsWith('Endpoint') && !key.endsWith('Command')) continue
    if (key === 'commandMetadata') continue
    const payload = val as Record<string, unknown>
    const meta = (o.commandMetadata as { webCommandMetadata?: { apiUrl?: string } })
      ?.webCommandMetadata
    const apiUrl = meta?.apiUrl || guessApiFromKey(key)
    if (apiUrl && (payload.params != null || Object.keys(payload).length > 0)) {
      return { apiUrl: normalizeApiUrl(apiUrl), body: { ...payload } }
    }
  }
  return null
}

function walkMenuItems(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return []
  const root = raw as Record<string, unknown>

  const candidates = [
    root.liveChatItemContextMenuSupportedRenderers,
    root.live_chat_item_context_menu_supported_renderers,
    root
  ]

  for (const supported of candidates) {
    if (!supported || typeof supported !== 'object') continue
    const s = supported as Record<string, unknown>
    const menu = (s.menuRenderer || s.menu || s) as Record<string, unknown>
    if (Array.isArray(menu.items)) return menu.items
    if (Array.isArray(s.items)) return s.items
  }
  return []
}

/**
 * Varre a árvore inteira por moderateLiveChat + label (p/ achar unhide
 * fora de menuServiceItemRenderer).
 */
export function extractModerateFromTree(root: unknown): RawModEndpoint[] {
  const out: RawModEndpoint[] = []
  const seen = new Set<string>()

  const walk = (node: unknown, depth: number, parentLabel: string): void => {
    if (!node || typeof node !== 'object' || depth > 18) return
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1, parentLabel)
      return
    }
    const o = node as Record<string, unknown>
    const labelHere =
      textOf(o.text) ||
      textOf(o.label) ||
      textOf(o.title) ||
      textOf((o.accessibilityData as { label?: string } | undefined)?.label) ||
      parentLabel

    const mod = findModerateEndpoint(o)
    if (mod && mod.body.params) {
      const iconType =
        (o.icon as { iconType?: string } | undefined)?.iconType ||
        (typeof o.iconType === 'string' ? o.iconType : '') ||
        ''
      const kind = classifyModAction(labelHere, iconType)
      if (kind === 'hide' || kind === 'unhide' || kind === 'delete' || kind === 'timeout') {
        const key = `${kind}:${String(mod.body.params).slice(0, 40)}`
        if (!seen.has(key)) {
          seen.add(key)
          out.push({
            apiUrl: mod.apiUrl,
            body: mod.body,
            label: labelHere || kind,
            iconType: iconType || `${kind.toUpperCase()}_${out.length}`,
            kind
          })
        }
      }
    }

    for (const [k, v] of Object.entries(o)) {
      if (k === 'loggingDirectives') continue
      walk(v, depth + 1, labelHere || parentLabel)
    }
  }

  walk(root, 0, '')
  return out
}

/** Extrai ações de moderação do JSON de get_item_context_menu */
export function extractRawModEndpoints(menuResponseData: unknown): RawModEndpoint[] {
  const items = walkMenuItems(menuResponseData)
  const out: RawModEndpoint[] = []
  let timeoutIdx = 0

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const wrapper = item as Record<string, unknown>
    const renderer = (wrapper.menuServiceItemRenderer ||
      wrapper.menuNavigationItemRenderer ||
      wrapper) as Record<string, unknown>

    const label = textOf(renderer.text) || textOf(renderer.label) || ''
    const iconType =
      (renderer.icon as { iconType?: string } | undefined)?.iconType ||
      (renderer.iconType as string) ||
      ''
    let kind = classifyModAction(label, iconType)

    // Timeout: opções de duração podem já estar embutidas no popup do item
    if (kind === 'timeout') {
      const embedded = extractTimeoutDurations(renderer)
      if (embedded.length > 0) {
        out.push(...embedded)
        continue
      }
      // Também procura no item inteiro (openPopupAction)
      const embedded2 = extractTimeoutDurations(item)
      if (embedded2.length > 0) {
        out.push(...embedded2)
        continue
      }
    }

    // Prefere moderate real; executáveis genéricos (block/report) não contam como mod
    const moderate = findModerateEndpoint(renderer)
    const exec =
      moderate ||
      findAnyExecutable(renderer.serviceEndpoint) ||
      findAnyExecutable(renderer.navigationEndpoint) ||
      findAnyExecutable(renderer)

    if (!exec) {
      // Timeout sem moderate ainda — marca placeholder para segundo passo
      if (kind === 'timeout') {
        out.push({
          apiUrl: 'live_chat/get_item_context_menu',
          body: {},
          label: label || 'Timeout',
          iconType: iconType || `TIMEOUT_OPEN_${timeoutIdx++}`,
          kind: 'timeout'
        })
      }
      continue
    }

    // Se o label parecia mod mas a API é report/block/feedback → ignora como mod
    if (isModerationKind(kind) && !isLiveChatModerateApi(exec.apiUrl)) {
      kind = 'other'
    }
    // Não enche o cache com lixo de viewer (report/block)
    if (kind === 'other' && !isLiveChatModerateApi(exec.apiUrl)) {
      continue
    }

    out.push({
      apiUrl: exec.apiUrl,
      body: exec.body,
      label: label || iconType || exec.apiUrl,
      iconType: iconType || label || `${kind}_${out.length}`,
      kind
    })
  }

  // Complementa com varredura profunda (unhide às vezes vem fora do item padrão)
  for (const extra of extractModerateFromTree(menuResponseData)) {
    if (!out.some((e) => e.kind === extra.kind && e.iconType === extra.iconType)) {
      out.push(extra)
    }
  }

  return out
}

/**
 * Só aceita labels de TEMPO (10 seconds, 5 minutes, 24 hours…).
 * Rejeita "Live chat", "Top chat", "Chat do canal", etc. que o scraper pega por engano.
 */
export function isTimeoutDurationLabel(label: string): boolean {
  const s = label.trim().toLowerCase()
  if (!s) return false

  // lixo conhecido do menu do YouTube
  if (
    s.includes('chat do canal') ||
    s.includes('channel chat') ||
    s.includes('super chat') ||
    s.includes('chat de super') ||
    s.includes('top chat') ||
    s.includes('live chat') ||
    s.includes('chat ao vivo') ||
    s.includes('principais') ||
    s.includes('slow mode') ||
    s.includes('modo lento') ||
    s.includes('subscribers') ||
    s.includes('membros') ||
    s.includes('emoji') ||
    s.includes('report') ||
    s.includes('denunciar')
  ) {
    return false
  }
  // "chat" sem número de tempo → não é duração
  if (s.includes('chat') && !/\d/.test(s)) return false

  // padrões de duração (EN / PT / genérico)
  return (
    /\b\d+\s*(s|sec|secs|second|seconds|segundo|segundos)\b/i.test(s) ||
    /\b\d+\s*(m|min|mins|minute|minutes|minuto|minutos)\b/i.test(s) ||
    /\b\d+\s*(h|hr|hrs|hour|hours|hora|horas)\b/i.test(s) ||
    /\b\d+\s*(d|day|days|dia|dias)\b/i.test(s)
  )
}

/** Chave estável da duração (dedupe EN/PT) */
export function durationKey(label: string): string | null {
  if (!isTimeoutDurationLabel(label)) return null
  const s = label.toLowerCase()
  const num = parseInt(s.match(/\d+/)?.[0] || '', 10)
  if (!Number.isFinite(num)) return null
  if (/\b(s|sec|second|segundo)/i.test(s)) return `${num}s`
  if (/\b(m|min|minute|minuto)/i.test(s)) return `${num}m`
  if (/\b(h|hr|hour|hora)/i.test(s)) return `${num}h`
  if (/\b(d|day|dia)/i.test(s)) return `${num}d`
  return null
}

export function resolveTimeoutDurationKey(
  label: string,
  iconType = ''
): string | null {
  const fromLabel = durationKey(label)
  if (fromLabel) return fromLabel
  const match = iconType.match(/TIMEOUT_(\d+)([SMHD])$/i)
  return match ? `${match[1]}${match[2]!.toLowerCase()}` : null
}
/** Preferir label em português quando houver duplicata */
function preferDurationLabel(a: string, b: string): string {
  const pt = /segundo|minuto|hora|dia/i
  if (pt.test(a) && !pt.test(b)) return a
  if (pt.test(b) && !pt.test(a)) return b
  return a.length <= b.length ? a : b
}

/** Ordem fixa do YouTube */
const DURATION_ORDER = ['10s', '1m', '5m', '10m', '30m', '24h']

/**
 * Opções de duração do timeout (10s, 1m, 5m…) — só tempo real.
 */
export function extractTimeoutDurations(dialogResponseData: unknown): RawModEndpoint[] {
  const byKey = new Map<string, RawModEndpoint>()

  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 16) return
    const o = node as Record<string, unknown>

    const opt =
      (o.optionSelectableItemRenderer as Record<string, unknown> | undefined) || null

    if (opt) {
      const label = textOf(opt.text) || textOf(opt.label) || ''
      if (!isTimeoutDurationLabel(label)) {
        // não é duração — ignora (Live chat, Top chat, etc.)
      } else {
        const exec =
          findModerateEndpoint(opt) ||
          findModerateEndpoint(opt.submitEndpoint) ||
          findAnyExecutable(opt.submitEndpoint) ||
          findAnyExecutable(opt)

        const key = durationKey(label)
        if (exec && key && (exec.apiUrl.includes('moderate') || exec.body.params)) {
          const prev = byKey.get(key)
          const niceLabel = prev ? preferDurationLabel(prev.label, label) : label
          byKey.set(key, {
            apiUrl: exec.apiUrl.includes('moderate') ? exec.apiUrl : 'live_chat/moderate',
            body: exec.body.params ? { params: exec.body.params } : exec.body,
            label: niceLabel,
            iconType: `TIMEOUT_${key}`,
            kind: 'timeout'
          })
        }
      }
    }

    for (const v of Object.values(o)) {
      if (Array.isArray(v)) for (const it of v) visit(it, depth + 1)
      else if (v && typeof v === 'object') visit(v, depth + 1)
    }
  }

  visit(dialogResponseData, 0)

  // Ordena: 10s, 1m, 5m, 10m, 30m, 24h (e extras no fim)
  const ordered: RawModEndpoint[] = []
  for (const k of DURATION_ORDER) {
    const ep = byKey.get(k)
    if (ep) {
      ordered.push(ep)
      byKey.delete(k)
    }
  }
  for (const ep of byKey.values()) ordered.push(ep)
  return ordered
}

/** Filtra lista qualquer para só durações de tempo */
export function filterOnlyTimeDurations(endpoints: RawModEndpoint[]): RawModEndpoint[] {
  const byKey = new Map<string, RawModEndpoint>()
  for (const e of endpoints) {
    if (e.kind !== 'timeout') continue
    if (!isTimeoutDurationLabel(e.label) && !e.iconType.match(/^TIMEOUT_\d/)) continue
    if (!isTimeoutDurationLabel(e.label)) continue
    const key = durationKey(e.label) || e.iconType
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, { ...e, iconType: `TIMEOUT_${key}` })
    } else {
      byKey.set(key, {
        ...prev,
        label: preferDurationLabel(prev.label, e.label)
      })
    }
  }
  const ordered: RawModEndpoint[] = []
  for (const k of DURATION_ORDER) {
    const ep = byKey.get(k)
    if (ep) {
      ordered.push(ep)
      byKey.delete(k)
    }
  }
  for (const ep of byKey.values()) ordered.push(ep)
  return ordered
}

export function rawToMenuActions(raw: RawModEndpoint[]): ModMenuAction[] {
  return preferredModActions(
    raw.map((r) => ({
      iconType: r.iconType,
      label: r.label,
      kind: r.kind
    }))
  )
}

/**
 * Params do get_item_context_menu no item (parseado youtubei ou JSON cru).
 * Varre várias formas: menu_endpoint, contextMenuEndpoint, liveChatItemContextMenuEndpoint.
 */
export function extractMenuParamsFromItem(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null
  const it = item as {
    menu_endpoint?: {
      payload?: { params?: string }
      metadata?: { api_url?: string }
      command?: { params?: string }
    }
    contextMenuEndpoint?: { liveChatItemContextMenuEndpoint?: { params?: string } }
  }
  const p1 = it.menu_endpoint?.payload?.params
  if (typeof p1 === 'string' && p1) return p1
  const pCmd = it.menu_endpoint?.command?.params
  if (typeof pCmd === 'string' && pCmd) return pCmd

  // raw-ish direto
  const raw = item as Record<string, unknown>
  const ctx = (raw.contextMenuEndpoint || raw.context_menu_endpoint) as
    | {
        liveChatItemContextMenuEndpoint?: { params?: string }
        live_chat_item_context_menu_endpoint?: { params?: string }
        params?: string
      }
    | undefined
  if (ctx) {
    const nested =
      ctx.liveChatItemContextMenuEndpoint?.params ||
      ctx.live_chat_item_context_menu_endpoint?.params ||
      (typeof ctx.params === 'string' ? ctx.params : undefined)
    if (nested) return nested
  }

  // deep walk (moderate às vezes aninha diferente)
  const deep = findContextMenuParamsDeep(item, 0)
  if (deep) return deep
  return null
}

function findContextMenuParamsDeep(node: unknown, depth: number): string | null {
  if (!node || depth > 10) return null
  if (Array.isArray(node)) {
    for (const x of node) {
      const p = findContextMenuParamsDeep(x, depth + 1)
      if (p) return p
    }
    return null
  }
  if (typeof node !== 'object') return null
  const o = node as Record<string, unknown>

  // liveChatItemContextMenuEndpoint: { params }
  for (const key of [
    'liveChatItemContextMenuEndpoint',
    'live_chat_item_context_menu_endpoint'
  ]) {
    const ep = o[key]
    if (ep && typeof ep === 'object') {
      const params = (ep as { params?: unknown }).params
      if (typeof params === 'string' && params.length > 8) return params
    }
  }

  // { contextMenuEndpoint: { ... } } — desce um nível com prioridade
  for (const key of ['contextMenuEndpoint', 'context_menu_endpoint', 'menu_endpoint']) {
    if (o[key] && typeof o[key] === 'object') {
      const p = findContextMenuParamsDeep(o[key], depth + 1)
      if (p) return p
    }
  }

  // payload.params em NavigationEndpoint-like
  if (o.payload && typeof o.payload === 'object') {
    const params = (o.payload as { params?: unknown }).params
    if (typeof params === 'string' && params.length > 8 && depth > 0) {
      // evita pegar params de moderate/show por engano no root
      if (
        o.name === 'liveChatItemContextMenuEndpoint' ||
        String((o as { metadata?: { api_url?: string } }).metadata?.api_url || '').includes(
          'context_menu'
        )
      ) {
        return params
      }
    }
  }

  for (const [k, v] of Object.entries(o)) {
    if (k === 'loggingDirectives' || k === 'trackingParams' || k === 'logs') continue
    if (v && typeof v === 'object') {
      const p = findContextMenuParamsDeep(v, depth + 1)
      if (p) return p
    }
  }
  return null
}
