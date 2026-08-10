/**
 * Entrega instantânea de mensagens do live chat.
 *
 * O youtubei.js usa SmoothedQueue + #emitSmoothedActions (~80ms entre cada msg),
 * imitando o pacing da UI do YouTube — em flood parece "1 por 1".
 *
 * Aqui: poll manual de get_live_chat e emite o lote inteiro de uma vez.
 */
import { Parser, type Innertube } from 'youtubei.js'
import { extractChannelActivityParam } from './channel-activity/channel-activity-params'
import {
  activateModerationActivity,
  analyzeRawModerationActions,
  extractRawLiveChatActions,
  onlyRawBootstrapChatItems,
  withoutRawModerationRenderers,
  type IncomingModerationEvent
} from './moderation/moderation-activity'
import {
  extractRawAutomodHeldFromResponse,
  extractRawAutomodHeldFromSingleAction,
  isParsedAutomodAction,
  type AutomodHeldParseResult
} from './moderation/automod-parser'

/** Emote padrão do YouTube Live (vem no liveChatContinuation.emojis) */
export type YtLiveEmoji = {
  emojiId: string
  shortcuts: string[]
  searchTerms: string[]
  url: string
  isCustom: boolean
}

export type ModerationEventSource = 'bootstrap' | 'live'

export type InstantChatHandlers = {
  onActions: (actions: unknown[], source: ModerationEventSource) => void
  onModerationEvents?: (
    events: IncomingModerationEvent[],
    source: ModerationEventSource
  ) => void
  onModerationActivityConfirmed?: () => void
  /** AutoMod held-for-review (JSON cru — não depende do Parser) */
  onAutomodHeld?: (items: AutomodHeldParseResult[]) => void
  /**
   * Resposta crua completa do get_live_chat (p/ enquetes em frameworkUpdates).
   */
  onRawLiveChatResponse?: (data: unknown) => void
  onChannelActivityParam?: (authorChannelId: string, params: string) => void
  onStart?: () => void
  onEnd?: (reason?: string) => void
  onError?: (err: Error) => void
  /** Lista completa de emotes YT (padrão + custom do chat) — 1ª resposta do get_live_chat */
  onEmojis?: (emojis: YtLiveEmoji[]) => void
}

function normalizeEmojiUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('http://')) return `https://${url.slice(7)}`
  return url
}

/**
 * Extrai emojis do continuation (youtubei LiveChatContinuation.emojis
 * ou raw JSON emojis[] do get_live_chat).
 */
export function extractLiveChatEmojis(contents: unknown): YtLiveEmoji[] {
  if (!contents || typeof contents !== 'object') return []
  const raw = (contents as { emojis?: unknown }).emojis
  if (!Array.isArray(raw) || raw.length === 0) return []

  const out: YtLiveEmoji[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const e = item as {
      emoji_id?: string
      emojiId?: string
      shortcuts?: string[]
      search_terms?: string[]
      searchTerms?: string[]
      is_custom_emoji?: boolean
      isCustomEmoji?: boolean
      image?: Array<{ url?: string; width?: number }> | { url?: string }
    }
    const id = e.emoji_id || e.emojiId || ''
    const shortcuts = e.shortcuts || []
    const searchTerms = e.search_terms || e.searchTerms || []
    let url = ''
    if (Array.isArray(e.image) && e.image.length) {
      const sorted = [...e.image].sort((a, b) => (b.width || 0) - (a.width || 0))
      const mid =
        sorted.find((t) => (t.width || 0) >= 32 && (t.width || 0) <= 64) ||
        sorted[sorted.length - 1] ||
        sorted[0]
      url = normalizeEmojiUrl(mid?.url || '')
    } else if (e.image && typeof e.image === 'object' && 'url' in e.image) {
      url = normalizeEmojiUrl(String((e.image as { url?: string }).url || ''))
    }
    if (!id && !shortcuts.length) continue
    if (!url) continue
    out.push({
      emojiId: id || shortcuts[0] || '',
      shortcuts,
      searchTerms,
      url,
      isCustom: !!(e.is_custom_emoji ?? e.isCustomEmoji)
    })
  }
  return out
}

/**
 * Automatic live-chat translation keeps the original text in hoverMessage.
 * Restore it before youtubei.js parses the renderer and discards that field.
 */
export function restoreOriginalTranslatedMessages(value: unknown): number {
  let restored = 0

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }

    const record = node as Record<string, unknown>
    const renderer = record.liveChatTextMessageRenderer
    if (renderer && typeof renderer === 'object') {
      const message = renderer as Record<string, unknown>
      const icon = message.messagePrefixIcon as
        | { iconType?: unknown }
        | undefined
      if (icon?.iconType === 'TRANSLATE' && message.hoverMessage) {
        message.message = message.hoverMessage
        restored++
      }
    }

    for (const child of Object.values(record)) walk(child)
  }

  walk(value)
  return restored
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const t = setTimeout(resolve, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      reject(new Error('aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function extractContinuationToken(contents: unknown): string | null {
  if (!contents || typeof contents !== 'object') return null
  const c = contents as {
    continuation?: { token?: string; timeout_ms?: number } | string
  }
  if (typeof c.continuation === 'string') return c.continuation
  if (c.continuation && typeof c.continuation === 'object' && c.continuation.token) {
    return c.continuation.token
  }
  return null
}

function extractTimeoutMs(contents: unknown): number {
  if (!contents || typeof contents !== 'object') return 300
  const c = contents as {
    continuation?: { timeout_ms?: number }
    timeout_ms?: number
  }
  const t = c.continuation?.timeout_ms ?? c.timeout_ms
  if (typeof t === 'number' && Number.isFinite(t) && t >= 0) {
    // YouTube costuma sugerir 0–5000ms; cap baixo = mais fluido no app desktop
    return Math.min(Math.max(t, 0), 800)
  }
  return 300
}

function extractActions(contents: unknown): unknown[] {
  if (!contents || typeof contents !== 'object') return []
  const c = contents as { actions?: unknown }
  const a = c.actions
  if (!a) return []
  if (Array.isArray(a)) return a
  try {
    return [...(a as Iterable<unknown>)]
  } catch {
    return []
  }
}

/**
 * Tenta pegar continuation de "Live chat" (todas as msgs) no header da 1ª resposta.
 * youtubei: TOP_CHAT = menu[0], LIVE_CHAT = menu[1]
 */
function tryLiveChatContinuation(contents: unknown): string | null {
  if (!contents || typeof contents !== 'object') return null
  const header = (contents as { header?: unknown }).header as
    | {
        view_selector?: {
          sub_menu_items?: Array<{
            title?: { text?: string } | string
            selected?: boolean
            continuation?: string | { token?: string }
          }>
        }
      }
    | undefined

  const items = header?.view_selector?.sub_menu_items
  if (!items?.length) return null

  const labelOf = (it: (typeof items)[0]): string => {
    const t = it.title
    if (typeof t === 'string') return t
    return t?.text || ''
  }

  // Prefer item cujo título indica live / chat ao vivo / all
  const byLabel = items.find((it) => {
    const l = labelOf(it).toLowerCase()
    return (
      l.includes('live') ||
      l.includes('ao vivo') ||
      l.includes('todas') ||
      l.includes('all')
    )
  })
  const pick = byLabel || items[1] || items.find((it) => !it.selected) || null
  if (!pick?.continuation) return null
  if (typeof pick.continuation === 'string') return pick.continuation
  return pick.continuation.token || null
}

export class InstantLiveChatPoller {
  private abort: AbortController | null = null
  private running = false
  /** >0 = envio em andamento — não competir com get_live_chat */
  private sendPriority = 0
  private readonly isReplay: boolean
  /** último continuation (p/ probe de menu após AutoMod Exibir) */
  private lastContinuation: string

  constructor(
    private readonly yt: Innertube,
    private readonly initialContinuation: string,
    private readonly handlers: InstantChatHandlers,
    opts?: { isReplay?: boolean }
  ) {
    this.isReplay = !!opts?.isReplay
    this.lastContinuation = initialContinuation
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.abort = new AbortController()
    void this.loop(this.abort.signal)
  }

  stop(): void {
    this.running = false
    this.abort?.abort()
    this.abort = null
  }

  /** Token atual do poll — recovery de context menu após Exibir */
  getContinuation(): string {
    return this.lastContinuation || this.initialContinuation
  }

  /** Pausa o poll enquanto o POST de envio usa a rede */
  beginSendPriority(): void {
    this.sendPriority++
  }

  endSendPriority(): void {
    this.sendPriority = Math.max(0, this.sendPriority - 1)
  }

  private async waitWhileSending(signal: AbortSignal): Promise<void> {
    while (this.sendPriority > 0 && this.running && !signal.aborted) {
      await sleep(8, signal).catch(() => undefined)
    }
  }

  private async loop(signal: AbortSignal): Promise<void> {
    let continuation = this.initialContinuation
    this.lastContinuation = continuation
    let first = true
    let nextPollSource: ModerationEventSource = 'bootstrap'
    let retries = 0

    console.log(
      `[instant-chat] poller started (sem SmoothedQueue) replay=${this.isReplay}`
    )

    while (this.running && !signal.aborted) {
      try {
        // Cede a rede ao envio (prioridade do POST send_message)
        await this.waitWhileSending(signal)

        const endpoint = this.isReplay
          ? 'live_chat/get_live_chat_replay'
          : 'live_chat/get_live_chat'
        this.lastContinuation = continuation
        const rawResponse = (await this.yt.actions.execute(endpoint, {
          continuation,
          parse: false,
          webClientInfo: { isDocumentHidden: false }
        })) as { data?: unknown; status_code?: number }

        if (!rawResponse.data) {
          throw new Error(
            `get_live_chat returned no data (HTTP ${rawResponse.status_code || 0})`
          )
        }

        restoreOriginalTranslatedMessages(rawResponse.data)

        const rawActions = extractRawLiveChatActions(rawResponse.data)
        if (this.handlers.onChannelActivityParam) {
          for (const rawAction of rawActions) {
            const found = extractChannelActivityParam(rawAction)
            if (found) this.handlers.onChannelActivityParam(found.authorChannelId, found.params)
          }
        }

        /**
         * Emite na MESMA ordem do feed do YouTube:
         * raw actions[] = oi tropa → retida → oi → retida…
         * (antes: todas as retidas primeiro, depois o resto = ordem errada)
         */
        const emitInYoutubeOrder = (
          rawList: unknown[],
          parsedList: unknown[],
          label: string,
          source: ModerationEventSource
        ): void => {
          const normals = parsedList.filter((a) => !isParsedAutomodAction(a))
          let ni = 0
          let heldN = 0
          let normalN = 0
          const heldBatch: AutomodHeldParseResult[] = []
          const normalBatch: unknown[] = []

          const flushHeld = (): void => {
            if (!heldBatch.length || !this.handlers.onAutomodHeld) {
              heldBatch.length = 0
              return
            }
            this.handlers.onAutomodHeld(heldBatch.splice(0, heldBatch.length))
          }
          const flushNormal = (): void => {
            if (!normalBatch.length) return
            this.handlers.onActions(normalBatch.splice(0, normalBatch.length), source)
          }

          for (const raw of rawList) {
            const held = extractRawAutomodHeldFromSingleAction(raw)
            if (held) {
              flushNormal()
              heldBatch.push(held)
              heldN++
              continue
            }
            // action normal (ou outra): pega o próximo item parseado não-AutoMod
            flushHeld()
            if (ni < normals.length) {
              normalBatch.push(normals[ni++])
              normalN++
            }
          }
          flushHeld()
          // resto do parse (se raw e parse divergirem)
          while (ni < normals.length) {
            normalBatch.push(normals[ni++])
            normalN++
          }
          flushNormal()

          if (heldN > 0) {
            console.log(
              `[automod] ${label} held=${heldN} normal=${normalN} (ordem YT)`
            )
          }
        }

        const parserInput = withoutRawModerationRenderers(rawResponse.data)
        const response = Parser.parseResponse(parserInput as never)

        const contents = (response as { continuation_contents?: unknown }).continuation_contents
        if (!contents) {
          this.handlers.onEnd?.('sem continuation_contents')
          break
        }

        // Emotes padrão YT (lista completa do picker do site) — costuma vir na 1ª resposta
        if (this.handlers.onEmojis) {
          const emojis = extractLiveChatEmojis(contents)
          if (emojis.length > 0) {
            this.handlers.onEmojis(emojis)
          }
        }

        if (first) {
          first = false

          try {
            const activation = await activateModerationActivity(
              rawResponse.data,
              (api, payload) => this.yt.actions.execute(api, payload),
              this.isReplay
            )
            if ('continuation' in activation) {
              restoreOriginalTranslatedMessages(activation.bootstrapResponse)
              continuation = activation.continuation
              this.lastContinuation = continuation
              this.handlers.onModerationActivityConfirmed?.()

              const bootstrapRaw = extractRawLiveChatActions(
                activation.bootstrapResponse
              )
              const bootstrapInput = onlyRawBootstrapChatItems(
                activation.bootstrapResponse
              )
              const bootstrapResponse = Parser.parseResponse(bootstrapInput as never)
              const bootstrapContents = (
                bootstrapResponse as { continuation_contents?: unknown }
              ).continuation_contents
              const bootstrapActions = bootstrapContents
                ? extractActions(bootstrapContents)
                : []

              // Fallback: se onlyRaw tirou automod do parse, ainda temos bootstrapRaw
              const bootstrapRawFull =
                bootstrapRaw.length > 0
                  ? bootstrapRaw
                  : extractRawLiveChatActions(activation.bootstrapResponse)

              console.log(
                `[mod-activity] ${activation.status} history=${bootstrapActions.length}`
              )
              this.handlers.onStart?.()
              emitInYoutubeOrder(
                bootstrapRawFull.length ? bootstrapRawFull : bootstrapRaw,
                bootstrapActions,
                'bootstrap',
                'bootstrap'
              )
              const bootstrapModerationEvents =
                analyzeRawModerationActions(bootstrapRawFull)
              if (bootstrapModerationEvents.length > 0) {
                this.handlers.onModerationEvents?.(
                  bootstrapModerationEvents,
                  'bootstrap'
                )
              }
              // Se bootstrap só tinha retidas no full response (filtradas do onlyRaw)
              if (
                bootstrapRawFull.length === 0 &&
                this.handlers.onAutomodHeld
              ) {
                const orphan = extractRawAutomodHeldFromResponse(
                  activation.bootstrapResponse
                )
                if (orphan.length) this.handlers.onAutomodHeld(orphan)
              }
              nextPollSource = 'live'
              continue
            }
            if (activation.status === 'unavailable') {
              console.log('[mod-activity] unavailable; using normal live chat')
            }
          } catch (error) {
            console.warn(
              '[mod-activity] activation failed; using normal live chat',
              (error as Error).message
            )
          }

          const liveCont = tryLiveChatContinuation(contents)
          if (liveCont) {
            continuation = liveCont
            this.lastContinuation = liveCont
            console.log('[instant-chat] modo=LIVE_CHAT (continuation do menu)')
            // Re-poll imediato com o token de Live Chat (primeira página pode ser Top)
            this.handlers.onStart?.()
            continue
          }
          this.handlers.onStart?.()
        }

        const next = extractContinuationToken(contents)
        if (next) {
          continuation = next
          this.lastContinuation = next
        }

        const pollSource = nextPollSource
        nextPollSource = 'live'
        const moderationEvents = analyzeRawModerationActions(rawActions)
        if (moderationEvents.length > 0) {
          this.handlers.onModerationEvents?.(moderationEvents, pollSource)
        }

        const actions = extractActions(contents)
        emitInYoutubeOrder(rawActions, actions, 'poll', pollSource)

        // Enquetes: % costumam vir em frameworkUpdates/entities (fora de actions[])
        try {
          this.handlers.onRawLiveChatResponse?.(rawResponse.data)
        } catch (e) {
          console.warn('[instant-chat] onRawLiveChatResponse', (e as Error).message)
        }

        retries = 0
        const waitMs = extractTimeoutMs(contents)
        await sleep(waitMs, signal)
      } catch (e) {
        if (signal.aborted || !this.running) break
        const err = e as Error
        if (err.message === 'aborted') break

        retries++
        this.handlers.onError?.(err)
        if (retries > 12) {
          this.handlers.onEnd?.('retry limit')
          break
        }
        await sleep(Math.min(2000, 400 * retries), signal).catch(() => undefined)
      }
    }

    this.running = false
    console.log('[instant-chat] poller stopped')
  }
}
