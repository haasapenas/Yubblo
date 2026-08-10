/**
 * Detecção de cooldown / slow mode do Live Chat (Innertube).
 * Só classifica por texto/erro conhecido — não inventa estado em msg normal.
 */

export type SendCooldownInfo = {
  isCooldown: boolean
  /** Segundos a esperar (se detectado) */
  seconds?: number
  /** Mensagem legível (PT/EN do YT ou gerada) */
  message?: string
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extrai "N segundos/seconds/min" de uma frase. */
export function extractWaitSeconds(text: string): number | undefined {
  const n = normalize(text)
  // "wait 10 seconds" / "aguarde 10 segundos" / "every 5 seconds" / "a cada 30 s"
  const m =
    n.match(
      /(?:wait|aguarde|aguardar|every|a cada|intervalo de|send a message every|envie.*?a cada)\s*(\d+)\s*(s|sec|secs|second|seconds|segundo|segundos|m|min|mins|minute|minutes|minuto|minutos)\b/
    ) ||
    n.match(
      /(\d+)\s*(s|sec|secs|second|seconds|segundo|segundos)\b.*(?:wait|aguarde|before|antes|entre)/
    ) ||
    n.match(/\b(\d+)\s*(s|sec|secs|second|seconds|segundo|segundos)\b/)
  if (!m) return undefined
  const amount = Number(m[1])
  const unit = m[2]
  if (!Number.isFinite(amount) || amount <= 0) return undefined
  if (/^m(in)?/.test(unit)) return amount * 60
  return amount
}

/** Mensagem amigável (nunca o erro interno do youtubei.js) */
export const COOLDOWN_USER_MESSAGE = 'Modo lento: aguarde antes de enviar'

/** Erro do parser do youtubei quando o YT devolve DimChatItemAction */
export function isDimChatItemParserError(text: string): boolean {
  if (!text) return false
  return (
    /DimChatItemAction/i.test(text) &&
    (/Expected node/i.test(text) || /got DimChatItemAction/i.test(text))
  )
}

/**
 * Corpo de send_message: YT recusou a bolha (slow mode / rate) com HTTP 200.
 * Sucesso real traz addChatItemAction; recusa traz só dimChatItemAction.
 */
export function isDimChatItemRejection(text: string): boolean {
  if (!text) return false
  if (isDimChatItemParserError(text)) return true
  const hasDim = /dimChatItemAction/i.test(text)
  if (!hasDim) return false
  // Se também adicionou item, não é recusa pura
  const hasAdd =
    /addChatItemAction/i.test(text) || /runAttestationCommand/i.test(text)
  return !hasAdd
}

/** Texto legível p/ UI — evita dump JSON / erro do parser */
export function friendlyCooldownMessage(
  raw?: string,
  seconds?: number
): string {
  if (seconds && seconds > 0) {
    return `Modo lento: aguarde ${Math.ceil(seconds)}s`
  }
  if (raw) {
    const n = normalize(raw)
    // Só reutiliza se for frase humana curta, não JSON/parser
    if (
      raw.length < 120 &&
      !raw.trimStart().startsWith('{') &&
      !/Expected node|dimChatItemAction|responseContext/i.test(raw) &&
      (n.includes('aguarde') ||
        n.includes('wait') ||
        n.includes('modo lento') ||
        n.includes('slow mode') ||
        n.includes('too quickly'))
    ) {
      return raw.trim()
    }
  }
  return COOLDOWN_USER_MESSAGE
}

/**
 * Erro de envio: "sending too quickly" / modo lento na resposta de send_message.
 */
export function parseCooldownFromErrorText(text: string): SendCooldownInfo {
  if (!text || !text.trim()) return { isCooldown: false }

  // DimChatItemAction = chat delay / slow mode (mesmo sem frase legível)
  if (isDimChatItemRejection(text) || isDimChatItemParserError(text)) {
    const seconds = extractWaitSeconds(text)
    return {
      isCooldown: true,
      seconds,
      message: friendlyCooldownMessage(text, seconds)
    }
  }

  const n = normalize(text)
  const looks =
    n.includes('too quickly') ||
    n.includes('too fast') ||
    n.includes('rate limit') ||
    n.includes('ratelimit') ||
    n.includes('slow mode') ||
    n.includes('modo lento') ||
    n.includes('rapido demais') ||
    n.includes('muito rapido') ||
    n.includes('muitas mensagens') ||
    n.includes('aguarde') ||
    n.includes('please wait') ||
    n.includes('wait before') ||
    n.includes('antes de enviar') ||
    n.includes('resource_exhausted') ||
    n.includes('resourcexhausted')
  if (!looks) return { isCooldown: false }
  const seconds = extractWaitSeconds(text)
  return {
    isCooldown: true,
    seconds,
    message: friendlyCooldownMessage(text, seconds)
  }
}

/**
 * Varre JSON da resposta de send_message (string ou objeto).
 * YT às vezes devolve 200 com actions de erro (DimChatItemAction).
 */
export function parseCooldownFromSendResponse(body: unknown): SendCooldownInfo {
  if (body == null) return { isCooldown: false }
  let raw = ''
  let text = ''
  if (typeof body === 'string') {
    raw = body
    text = body
    try {
      const j = JSON.parse(body) as unknown
      const deep = collectStrings(j, 0)
      if (deep) text = `${body}\n${deep}`
    } catch {
      /* plain text */
    }
  } else {
    raw = JSON.stringify(body)
    text = `${raw}\n${collectStrings(body, 0)}`
  }

  // Dim sem Add = recusa de delay (HTTP 200 enganoso)
  if (isDimChatItemRejection(raw) || isDimChatItemRejection(text)) {
    const seconds = extractWaitSeconds(text)
    return {
      isCooldown: true,
      seconds,
      message: friendlyCooldownMessage(text, seconds)
    }
  }

  // rateLimitExceeded no JSON
  if (/rateLimitExceeded|RESOURCE_EXHAUSTED/i.test(text)) {
    const fromText = parseCooldownFromErrorText(text)
    return {
      isCooldown: true,
      seconds: fromText.seconds,
      message: fromText.message || 'Envio limitado (rate limit).'
    }
  }
  return parseCooldownFromErrorText(text)
}

/**
 * HTTP 200 + body: só é sucesso se o YT de fato adicionou a mensagem.
 * Sem actions conhecidas, assume OK (compat); com só dim → falha.
 */
export function isSuccessfulSendBody(bodyText: string): boolean {
  if (!bodyText || !bodyText.trim()) return true
  if (isDimChatItemRejection(bodyText)) return false
  // Se há array/objeto de actions e nenhuma add, e há dim → já coberto
  // Erros explícitos
  if (/error["']?\s*:\s*\{/i.test(bodyText) && /rateLimitExceeded|RESOURCE_EXHAUSTED/i.test(bodyText)) {
    return false
  }
  return true
}

function collectStrings(node: unknown, depth: number): string {
  if (depth > 12 || node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  if (Array.isArray(node)) {
    return node.map((x) => collectStrings(x, depth + 1)).filter(Boolean).join('\n')
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    // runs: [{text}]
    if (Array.isArray(o.runs)) {
      const joined = o.runs
        .map((r) =>
          r && typeof r === 'object' && 'text' in r
            ? String((r as { text?: string }).text || '')
            : ''
        )
        .join('')
      if (joined) return joined
    }
    return Object.values(o)
      .map((v) => collectStrings(v, depth + 1))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/**
 * Mode change do chat: "Slow mode is on" / "Modo lento ativado"
 * subtext: "Send a message every 10 seconds"
 */
export function parseSlowModeFromModeChange(
  primary: string,
  subtext?: string
): { enabled: boolean | null; intervalSeconds?: number } {
  const p = normalize(primary || '')
  const s = normalize(subtext || '')
  const joined = `${p} ${s}`.trim()
  if (!joined) return { enabled: null }

  const off =
    p.includes('slow mode is off') ||
    p.includes('modo lento') && (p.includes('desativ') || p.includes('off')) ||
    p.includes('slow mode') && p.includes('off')
  if (off) return { enabled: false }

  const on =
    p.includes('slow mode is on') ||
    p.includes('modo lento') && (p.includes('ativ') || p.includes('ligado') || p.includes('on')) ||
    p.includes('slow mode') && !p.includes('off') ||
    s.includes('every') ||
    s.includes('a cada')
  if (!on && !s.includes('second') && !s.includes('segundo')) {
    return { enabled: null }
  }

  const intervalSeconds =
    extractWaitSeconds(subtext || '') || extractWaitSeconds(primary || '')
  return {
    enabled: on || intervalSeconds != null,
    intervalSeconds
  }
}

/** Frase curta para a UI do composer */
export function formatCooldownHint(
  remainingSec: number,
  slowModeSeconds?: number
): string {
  const n = Math.max(0, Math.ceil(remainingSec))
  if (slowModeSeconds && slowModeSeconds > 0) {
    return `Modo lento: aguarde ${n}s`
  }
  return n > 0 ? `Aguarde ${n}s para enviar` : ''
}
