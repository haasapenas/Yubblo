/**
 * Envio rápido de mensagem no live chat.
 *
 * Estratégias (a mais rápida bem-sucedida vence):
 *  1) Chromium session.fetch (HTTP/2 keep-alive do Electron)
 *  2) Node undici/fetch com Agent keep-alive
 *  3) Innertube session.http (auth nativa, parse:false)
 *
 * Medimos e preferimos o vencedor nas próximas mensagens.
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { Agent, fetch as undiciFetch } from 'undici'
import { session } from 'electron'
import type { Innertube } from 'youtubei.js'
import { AUTH_PARTITION } from '../auth'
import { getMainLocale } from '../i18n/i18n-main'
import { getYoutubeLocale } from '../../shared/i18n/youtube-locale'
import {
  friendlyCooldownMessage,
  isSuccessfulSendBody,
  parseCooldownFromErrorText,
  parseCooldownFromSendResponse
} from './send-cooldown'
import type { YoutubeMessageSegment } from './youtube-message'

const require = createRequire(import.meta.url)

const SEND_PATH = '/youtubei/v1/live_chat/send_message'
const SEND_URL = `https://www.youtube.com${SEND_PATH}?prettyPrint=false&alt=json`

/** Keep-alive Node → evita novo TLS a cada mensagem */
const nodeAgent = new Agent({
  connect: { timeout: 8_000 },
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 120_000,
  pipelining: 1
})

/** Raiz do pacote youtubei.js no disco (bypassa "exports" restritos) */
function youtubeiPackageRoot(): string {
  const entry = require.resolve('youtubei.js')
  const marker = `${join('node_modules', 'youtubei.js')}`
  const idx = entry.lastIndexOf(marker)
  if (idx >= 0) {
    return entry.slice(0, idx + marker.length)
  }
  let dir = dirname(entry)
  for (let i = 0; i < 10; i++) {
    const protos = join(dir, 'dist', 'protos', 'generated', 'misc', 'params.js')
    if (existsSync(protos)) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('Não achei a raiz do pacote youtubei.js')
}

function u8ToBase64(u8: Uint8Array): string {
  return Buffer.from(u8).toString('base64')
}

let cachedEncode:
  | ((msg: unknown) => { finish: () => Uint8Array })
  | null = null

function getLiveMessageParamsEncode(): (msg: unknown) => { finish: () => Uint8Array } {
  if (cachedEncode) return cachedEncode
  const root = youtubeiPackageRoot()
  const paramsPath = join(root, 'dist', 'protos', 'generated', 'misc', 'params.js')
  if (!existsSync(paramsPath)) {
    throw new Error(`params.js não encontrado: ${paramsPath}`)
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(paramsPath) as {
    LiveMessageParams: {
      encode: (msg: unknown) => { finish: () => Uint8Array }
    }
  }
  cachedEncode = mod.LiveMessageParams.encode.bind(mod.LiveMessageParams)
  return cachedEncode
}

export function buildLiveChatSendParams(videoId: string, channelId: string): string {
  const encode = getLiveMessageParamsEncode()
  const writer = encode({
    params: {
      ids: {
        videoId,
        channelId
      }
    },
    number0: 1,
    number1: 4
  })
  return btoa(encodeURIComponent(u8ToBase64(writer.finish())))
}

function sapisidFromCookie(cookie: string): string | null {
  const m =
    cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/) ||
    cookie.match(/(?:^|;\s*)__Secure-3PAPISID=([^;]+)/) ||
    cookie.match(/(?:^|;\s*)__Secure-1PAPISID=([^;]+)/)
  return m?.[1] ?? null
}

/** Cache SAPISIDHASH por segundo */
let authCache: { key: string; ts: number; header: string } | null = null

function sapisidHashHeader(sapisid: string): string {
  const ts = Math.floor(Date.now() / 1000)
  if (authCache && authCache.key === sapisid && authCache.ts === ts) {
    return authCache.header
  }
  const input = `${ts} ${sapisid} https://www.youtube.com`
  const hash = createHash('sha1').update(input).digest('hex')
  const header = `SAPISIDHASH ${ts}_${hash}`
  authCache = { key: sapisid, ts, header }
  return header
}

function minimalSendContext(yt: Innertube): Record<string, unknown> {
  const c = yt.session.context
  const client = c.client as Record<string, unknown>
  const locale = getYoutubeLocale(getMainLocale())
  return {
    client: {
      hl: client.hl ?? locale.hl,
      gl: client.gl ?? locale.gl,
      clientName: client.clientName ?? 'WEB',
      clientVersion: client.clientVersion,
      visitorData: client.visitorData,
      userAgent: client.userAgent,
      platform: client.platform ?? 'DESKTOP',
      originalUrl: 'https://www.youtube.com/',
      screenWidthPoints: 1920,
      screenHeightPoints: 1080,
      utcOffsetMinutes: -180
    },
    user: (c as { user?: unknown }).user ?? { lockedSafetyMode: false },
    request: (c as { request?: unknown }).request ?? { useSsl: true },
    clickTracking: (c as { clickTracking?: unknown }).clickTracking
  }
}

export type FastSendResult = {
  ok: boolean
  status: number
  ms: number
  error?: string
  via?: string
  /** Segundos de cooldown se o YT recusou por rate/slow mode */
  cooldownSeconds?: number
  /** Corpo bruto (trecho) p/ parse de cooldown no chat-service */
  bodyText?: string
}

export function buildLiveChatSendBody(
  context: Record<string, unknown>,
  params: string,
  segments: YoutubeMessageSegment[],
  clientMessageId: string
): {
  context: Record<string, unknown>
  params: string
  richMessage: { textSegments: YoutubeMessageSegment[] }
  clientMessageId: string
} {
  return {
    context,
    params,
    richMessage: { textSegments: segments },
    clientMessageId
  }
}

/** Preferência aprendida (qual via foi mais rápida e ok) */
let preferredVia: 'chromium' | 'undici' | 'innertube' | null = null
let viaStats: Record<string, { ok: number; fail: number; totalMs: number }> = {}

function recordStat(via: string, ok: boolean, ms: number): void {
  if (!viaStats[via]) viaStats[via] = { ok: 0, fail: 0, totalMs: 0 }
  if (ok) {
    viaStats[via].ok++
    viaStats[via].totalMs += ms
  } else {
    viaStats[via].fail++
  }
}

export function getSendViaStats(): typeof viaStats {
  return { ...viaStats }
}

function authSession() {
  return session.fromPartition(AUTH_PARTITION)
}

function buildHeaders(
  cookie: string,
  sapisid: string,
  videoId: string,
  clientVersion: string,
  visitorData: string
): Record<string, string> {
  const locale = getYoutubeLocale(getMainLocale())
  return {
    'Content-Type': 'application/json',
    Accept: '*/*',
    'Accept-Language': locale.acceptLanguage,
    Cookie: cookie,
    Authorization: sapisidHashHeader(sapisid),
    'X-Goog-Authuser': '0',
    'X-Goog-Visitor-Id': visitorData,
    'X-Youtube-Client-Name': '1',
    'X-Youtube-Client-Version': clientVersion,
    Origin: 'https://www.youtube.com',
    Referer: `https://www.youtube.com/watch?v=${videoId}`,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  }
}

function resultFromBody(
  via: string,
  status: number,
  ms: number,
  bodyText: string,
  httpOk: boolean
): FastSendResult {
  const cd = parseCooldownFromSendResponse(bodyText)
  const success =
    httpOk && !cd.isCooldown && isSuccessfulSendBody(bodyText)
  if (success) {
    return { ok: true, status, ms, via }
  }
  if (cd.isCooldown) {
    return {
      ok: false,
      status,
      ms,
      via,
      cooldownSeconds: cd.seconds,
      error: friendlyCooldownMessage(cd.message, cd.seconds),
      bodyText: bodyText.slice(0, 400)
    }
  }
  return {
    ok: false,
    status,
    ms,
    via,
    error:
      bodyText.trim().startsWith('{')
        ? bodyText.slice(0, 200) || `HTTP ${status}`
        : bodyText.slice(0, 200) || `HTTP ${status}`,
    bodyText: bodyText.slice(0, 400)
  }
}

async function sendChromium(
  headers: Record<string, string>,
  body: string,
  t0: number
): Promise<FastSendResult> {
  const ses = authSession()
  const res = await ses.fetch(SEND_URL, { method: 'POST', headers, body })
  const ms = Math.round(performance.now() - t0)
  const bodyText = await res.text().catch(() => '')
  return resultFromBody('chromium', res.status, ms, bodyText, res.ok)
}

async function sendUndici(
  headers: Record<string, string>,
  body: string,
  t0: number
): Promise<FastSendResult> {
  const res = await undiciFetch(SEND_URL, {
    method: 'POST',
    headers,
    body,
    dispatcher: nodeAgent
  })
  const ms = Math.round(performance.now() - t0)
  const bodyText = await res.text().catch(() => '')
  return resultFromBody('undici', res.status, ms, bodyText, res.ok)
}

/**
 * Usa a sessão autenticada do Innertube (mesmo cookie/SAPISIDHASH que o login).
 * parse:false → não gasta tempo no Parser do youtubei.
 */
export async function sendViaInnertube(
  yt: Innertube,
  params: string,
  text: string,
  segments: YoutubeMessageSegment[] = [{ text }]
): Promise<FastSendResult> {
  const t0 = performance.now()
  try {
    const actions = yt.session.actions
    const res = (await actions.execute('/live_chat/send_message', {
      richMessage: { textSegments: segments },
      clientMessageId: randomUUID(),
      client: 'WEB',
      parse: false,
      params
    })) as { success?: boolean; status_code?: number; data?: unknown }

    const ms = Math.round(performance.now() - t0)
    // youtubei HTTP wrapper: success / status
    const status =
      typeof res.status_code === 'number'
        ? res.status_code
        : res.success === false
          ? 400
          : 200
    const data = res.data ?? res
    const bodyText =
      typeof data === 'string' ? data : JSON.stringify(data ?? '')
    const httpOk =
      status >= 200 && status < 300 && res.success !== false
    return resultFromBody('innertube', status, ms, bodyText, httpOk)
  } catch (e) {
    const msg = (e as Error).message
    const cd = parseCooldownFromErrorText(msg)
    return {
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - t0),
      error: cd.isCooldown
        ? friendlyCooldownMessage(msg, cd.seconds)
        : msg,
      cooldownSeconds: cd.seconds,
      via: 'innertube'
    }
  }
}

/**
 * Envia com a ordem preferida (aprendida) e faz fallback.
 * Opcionalmente corre chromium ∥ undici em paralelo no 1º envio (benchmark).
 */
export async function fastSendLiveChatMessage(opts: {
  yt: Innertube
  cookie: string
  videoId: string
  channelId: string
  params: string
  text: string
  segments?: YoutubeMessageSegment[]
  /** true = mede chromium vs undici vs innertube (log) */
  benchmark?: boolean
}): Promise<FastSendResult> {
  const t0 = performance.now()
  const sapisid = sapisidFromCookie(opts.cookie)
  if (!sapisid) {
    return { ok: false, status: 0, ms: 0, error: 'SAPISID ausente', via: 'none' }
  }
  if (!opts.params) {
    return { ok: false, status: 0, ms: 0, error: 'params vazio', via: 'none' }
  }
  if (!opts.channelId) {
    return { ok: false, status: 0, ms: 0, error: 'channelId vazio', via: 'none' }
  }

  const context = minimalSendContext(opts.yt)
  const client = context.client as { clientVersion?: string; visitorData?: string }
  const clientVersion = client.clientVersion || ''
  const visitorData = (client.visitorData as string) || ''

  const segments =
    opts.segments?.length ? opts.segments : [{ text: opts.text }]
  const body = JSON.stringify(
    buildLiveChatSendBody(
      context,
      opts.params,
      segments,
      randomUUID()
    )
  )

  const headers = buildHeaders(
    opts.cookie,
    sapisid,
    opts.videoId,
    clientVersion,
    visitorData
  )

  const tryOne = async (
    name: 'chromium' | 'undici' | 'innertube'
  ): Promise<FastSendResult> => {
    try {
      if (name === 'chromium') return await sendChromium(headers, body, t0)
      if (name === 'undici') return await sendUndici(headers, body, t0)
      return await sendViaInnertube(
        opts.yt,
        opts.params,
        opts.text,
        segments
      )
    } catch (e) {
      return {
        ok: false,
        status: 0,
        ms: Math.round(performance.now() - t0),
        error: (e as Error).message,
        via: name
      }
    }
  }

  // Ordem: preferido aprendido → chromium → undici → innertube
  // Sequencial (NÃO paralelo) — paralelo enviaria a msg 3x no chat
  const order: Array<'chromium' | 'undici' | 'innertube'> = [
    preferredVia,
    'chromium',
    'undici',
    'innertube'
  ].filter((v, i, a) => v && a.indexOf(v) === i) as Array<
    'chromium' | 'undici' | 'innertube'
  >

  let last: FastSendResult = {
    ok: false,
    status: 0,
    ms: 0,
    error: 'nenhuma via tentada',
    via: 'none'
  }

  for (const via of order) {
    const r = await tryOne(via)
    recordStat(r.via || via, r.ok, r.ms)
    if (opts.benchmark) {
      console.log(
        `[send-bench] via=${r.via} ok=${r.ok} status=${r.status} ms=${r.ms}${
          r.error ? ` err=${String(r.error).slice(0, 80)}` : ''
        }`
      )
    }
    if (r.ok) {
      if (!preferredVia || preferredVia !== via) {
        console.log(`[send] via preferida=${via} (${r.ms}ms)`)
      }
      preferredVia = via
      return r
    }
    // Chat delay / slow mode: não adianta tentar outra via (mesmo rejeição do YT)
    if (r.cooldownSeconds != null || parseCooldownFromSendResponse(r.bodyText || r.error || '').isCooldown) {
      const cd = parseCooldownFromSendResponse(r.bodyText || '')
      const merged: FastSendResult = {
        ...r,
        ok: false,
        cooldownSeconds: r.cooldownSeconds ?? cd.seconds,
        error: friendlyCooldownMessage(r.error || cd.message, r.cooldownSeconds ?? cd.seconds)
      }
      console.log(
        `[send] via=${via} chat-delay status=${r.status} ms=${r.ms} cd=${merged.cooldownSeconds ?? '?'}s`
      )
      return merged
    }
    console.warn(
      `[send] via=${via} falhou status=${r.status} ms=${r.ms} ${r.error?.slice(0, 100) || ''}`
    )
    last = r
    // tenta próxima via
  }

  return last
}

/** Esquenta sockets (generate_204 + POST seco no endpoint de envio) */
export async function prewarmYoutubeConnection(cookie: string): Promise<void> {
  const headers = {
    Cookie: cookie,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    Origin: 'https://www.youtube.com',
    Referer: 'https://www.youtube.com/'
  }
  try {
    const ses = authSession()
    await Promise.all([
      ses.fetch('https://www.youtube.com/generate_204', { method: 'GET', headers }).catch(() => null),
      // abre HTTP/2 no host youtubei
      ses
        .fetch(SEND_URL, {
          method: 'POST',
          headers,
          body: '{}'
        })
        .catch(() => null),
      undiciFetch('https://www.youtube.com/generate_204', {
        method: 'GET',
        headers,
        dispatcher: nodeAgent
      }).catch(() => null)
    ])
  } catch {
    /* ignore */
  }
}
