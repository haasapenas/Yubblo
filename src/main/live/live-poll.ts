/**
 * Enquetes (polls) do YouTube Live Chat.
 * Fontes: AddBanner (header PollHeader + contents), UpdateLiveChatPollAction, raw JSON.
 */
import type { LivePollChoice, LivePollState } from '../../shared/types'

export type PollVoteEndpoint = {
  apiUrl: string
  body: Record<string, unknown>
}

export type ParsedLivePoll = LivePollState & {
  /** optionId → endpoint de voto (não enviar ao renderer) */
  voteEndpoints: Map<string, PollVoteEndpoint>
}

function textOf(value: unknown): string {
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
      try {
        const s = o.toString()
        if (s && s !== '[object Object]') return s
      } catch {
        /* ignore */
      }
    }
  }
  return ''
}

function isPlaceholderQuestion(q: string | undefined): boolean {
  const s = (q || '').trim().toLowerCase()
  return !s || s === 'enquete' || s === 'poll' || s === 'live poll'
}

function ratioToPercent(ratio: number | null | undefined): string | undefined {
  if (ratio == null || Number.isNaN(Number(ratio))) return undefined
  const n = Number(ratio)
  // YT manda 0–1 ou às vezes já 0–100
  const p = n > 1 ? Math.round(n) : Math.round(n * 100)
  if (p < 0 || p > 100) return undefined
  return `${p}%`
}

function stableOptionId(text: string, index: number, rawId?: string): string {
  if (rawId && String(rawId).trim()) return String(rawId).trim()
  // estável por índice+texto (updates reutilizam)
  const slug = text
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .slice(0, 40)
  return `opt-${index}-${slug}`
}

function endpointFromNav(ep: unknown): PollVoteEndpoint | null {
  if (!ep || typeof ep !== 'object') return null
  const o = ep as {
    metadata?: { api_url?: string }
    payload?: Record<string, unknown>
  }
  let apiUrl =
    o.metadata?.api_url?.replace(/^\/youtubei\/v1\//, '').replace(/^\//, '') ||
    ''
  let body: Record<string, unknown> =
    o.payload && typeof o.payload === 'object' ? { ...o.payload } : {}

  // NavigationEndpoint cru / serviceEndpoint
  const raw = ep as Record<string, unknown>
  const keys = Object.keys(raw).filter(
    (k) =>
      k.endsWith('Endpoint') ||
      k.endsWith('Command') ||
      k === 'selectServiceEndpoint' ||
      k === 'serviceEndpoint' ||
      k === 'command'
  )
  for (const k of keys) {
    const payload = raw[k]
    if (!payload || typeof payload !== 'object') continue
    if (k === 'selectServiceEndpoint' || k === 'serviceEndpoint' || k === 'command') {
      const nested = endpointFromNav(payload)
      if (nested) return nested
      continue
    }
    body = payload as Record<string, unknown>
    if (/poll|vote/i.test(k)) {
      apiUrl = guessApiFromKey(k)
      break
    }
    if (!apiUrl) apiUrl = guessApiFromKey(k)
  }

  // commandMetadata no cru
  const meta = (raw.commandMetadata || raw.metadata) as
    | { webCommandMetadata?: { apiUrl?: string }; api_url?: string }
    | undefined
  const apiFromMeta =
    meta?.webCommandMetadata?.apiUrl || meta?.api_url || ''
  if (apiFromMeta) {
    apiUrl = String(apiFromMeta)
      .replace(/^\/youtubei\/v1\//, '')
      .replace(/^\//, '')
  }

  if (!apiUrl && body && (body.params || body.clientIds)) {
    apiUrl = 'live_chat/vote'
  }
  if (!apiUrl) return null
  return { apiUrl, body }
}

function guessApiFromKey(key: string): string {
  const map: Record<string, string> = {
    liveChatPollVoteEndpoint: 'live_chat/vote',
    liveChatVoteEndpoint: 'live_chat/vote',
    voteEndpoint: 'live_chat/vote',
    feedbackEndpoint: 'feedback'
  }
  if (map[key]) return map[key]
  // liveChatSomethingEndpoint → live_chat/something (aproximado)
  if (key.endsWith('Endpoint')) {
    const base = key.slice(0, -'Endpoint'.length)
    const snake = base
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/_/g, '/')
      .toLowerCase()
    if (snake.includes('vote') || snake.includes('poll')) {
      return snake.startsWith('live') ? snake : `live_chat/${snake}`
    }
  }
  return ''
}

type ChoiceIn = {
  text?: unknown
  option_id?: string
  select_endpoint?: unknown
  deselect_endpoint?: unknown
  vote_ratio_if_selected?: number | null
  vote_percentage_if_selected?: unknown
  vote_ratio_if_not_selected?: number | null
  vote_percentage_if_not_selected?: unknown
}

/** Extrai ratio/percent de um choice em qualquer forma que o YT mande */
function extractChoiceVotes(c: Record<string, unknown>): {
  ratio?: number
  percent?: string
} {
  const num = (v: unknown): number | undefined => {
    if (typeof v === 'number' && !Number.isNaN(v)) return v
    if (typeof v === 'string' && v.trim() && !/n\/?a/i.test(v)) {
      const n = parseFloat(v.replace('%', '').replace(',', '.').trim())
      if (!Number.isNaN(n)) return n
    }
    return undefined
  }

  // campos possíveis (parsed snake + raw camel + entity)
  const ratio =
    num(c.vote_ratio_if_selected) ??
    num(c.vote_ratio_if_not_selected) ??
    num(c.vote_ratio) ??
    num(c.voteRatioIfSelected) ??
    num(c.voteRatioIfNotSelected) ??
    num(c.voteRatio) ??
    num(c.ratio)

  const percentCandidates = [
    c.vote_percentage_if_selected,
    c.vote_percentage_if_not_selected,
    c.vote_percentage,
    c.votePercentageIfSelected,
    c.votePercentageIfNotSelected,
    c.votePercentage,
    c.percentage,
    c.subtitle,
    c.notSelectedSubtitle
  ]
  let percent: string | undefined
  for (const p of percentCandidates) {
    const t = textOf(p).trim()
    if (t && !/^n\/?a$/i.test(t) && t !== '[object Object]') {
      // normaliza "42 %" → "42%"
      const m = t.match(/(\d+(?:[.,]\d+)?)\s*%/)
      percent = m ? `${m[1].replace(',', '.')}%` : t.includes('%') ? t : undefined
      if (percent) break
      // só número → trata como %
      const n = num(t)
      if (n != null && n >= 0 && n <= 100) {
        percent = `${Math.round(n)}%`
        break
      }
    }
  }

  if (!percent && ratio != null) {
    percent = ratioToPercent(ratio)
  }

  // se ratio veio 0–100 por engano
  let finalRatio = ratio
  if (finalRatio != null && finalRatio > 1 && finalRatio <= 100) {
    finalRatio = finalRatio / 100
  }

  return { ratio: finalRatio, percent }
}

function parseChoices(choices: ChoiceIn[]): {
  outChoices: LivePollChoice[]
  voteEndpoints: Map<string, PollVoteEndpoint>
} {
  const voteEndpoints = new Map<string, PollVoteEndpoint>()
  const outChoices: LivePollChoice[] = []

  choices.forEach((c, i) => {
    const rec = c as unknown as Record<string, unknown>
    const text = textOf(c.text).trim() || `Opção ${i + 1}`
    const optionId = stableOptionId(
      text,
      i,
      c.option_id ||
        (typeof rec.pollOptionId === 'string' ? rec.pollOptionId : undefined) ||
        (typeof rec.optionId === 'string' ? rec.optionId : undefined)
    )
    const { ratio, percent } = extractChoiceVotes(rec)
    outChoices.push({
      optionId,
      text,
      voteRatio: ratio,
      votePercent: percent
    })
    const ep =
      endpointFromNav(c.select_endpoint) ||
      endpointFromNav(c.deselect_endpoint) ||
      endpointFromNav(rec.selectServiceEndpoint) ||
      endpointFromNav(rec.serviceEndpoint)
    if (ep) voteEndpoints.set(optionId, ep)
  })

  return { outChoices, voteEndpoints }
}

function parsePollNode(poll: {
  choices?: ChoiceIn[]
  total_votes?: unknown
  live_chat_poll_id?: string
  question?: unknown
}): ParsedLivePoll | null {
  const choices = poll.choices || []
  if (!choices.length) return null
  const { outChoices, voteEndpoints } = parseChoices(choices)
  const pollId =
    poll.live_chat_poll_id ||
    `poll-${outChoices.map((c) => c.text).join('|').slice(0, 80)}`
  const question = textOf(poll.question).trim()

  return {
    pollId,
    question: question || '',
    choices: outChoices,
    totalVotes: textOf(poll.total_votes) || undefined,
    closed: false,
    voteEndpoints
  }
}

function parseBannerPoll(banner: {
  poll_question?: unknown
  metadata?: unknown
  choices?: Array<{ option_id?: string; text?: string | unknown }>
  /** se true, permite header-only (sem choices) p/ merge de metadata */
  allowEmptyChoices?: boolean
}): ParsedLivePoll | null {
  const question = textOf(banner.poll_question).trim()
  const totalFromMeta = textOf(banner.metadata).trim()
  const choices = (banner.choices || []).map((c, i) => {
    const text = textOf(c.text).trim() || `Opção ${i + 1}`
    return {
      optionId: stableOptionId(text, i, c.option_id),
      text
    }
  })
  if (!choices.length && !banner.allowEmptyChoices) {
    // Header sozinho (pergunta/total) sem opções → não cria enquete vazia
    if (!question && !totalFromMeta) return null
    return {
      pollId: `meta-${(question || totalFromMeta).slice(0, 40)}`,
      question: question || '',
      choices: [],
      totalVotes: cleanTotalVotes(totalFromMeta) || totalFromMeta || undefined,
      closed: false,
      voteEndpoints: new Map(),
      /** flag interna: só metadata */
      _metaOnly: true
    } as ParsedLivePoll & { _metaOnly?: boolean }
  }
  if (!question && !choices.length) return null
  return {
    pollId: `banner-${(question || 'q').slice(0, 40)}-${choices.map((c) => c.optionId).join(',').slice(0, 60)}`,
    question: question || '',
    choices,
    totalVotes: cleanTotalVotes(totalFromMeta) || totalFromMeta || undefined,
    closed: false,
    voteEndpoints: new Map()
  }
}

/** Extrai poll de action parseada (youtubei.js) */
export function parsePollFromAction(action: unknown): ParsedLivePoll | null {
  if (!action || typeof action !== 'object') return null
  const node = action as {
    type?: string
    banner?: {
      header?: {
        type?: string
        poll_question?: unknown
        metadata?: unknown
      }
      contents?: {
        type?: string
        poll_question?: unknown
        choices?: Array<{ option_id?: string; text?: unknown }>
        // Poll node fields
        total_votes?: unknown
        live_chat_poll_id?: string
      }
    }
    poll_to_update?: {
      type?: string
      choices?: ChoiceIn[]
      total_votes?: unknown
      live_chat_poll_id?: string
      // às vezes header embutido
      header?: { poll_question?: unknown; metadata?: unknown }
    }
  }

  if (
    node.type === 'AddBannerToLiveChatCommand' ||
    /AddBanner/i.test(String(node.type || ''))
  ) {
    const header = node.banner?.header
    const contents = node.banner?.contents
    let fromHeader: ParsedLivePoll | null = null
    let fromContents: ParsedLivePoll | null = null

    if (header && (header.poll_question != null || header.metadata != null)) {
      fromHeader = parseBannerPoll({
        poll_question: header.poll_question,
        metadata: header.metadata,
        choices: []
      })
    }

    if (contents) {
      if (
        contents.type === 'LiveChatBannerPoll' ||
        /BannerPoll/i.test(String(contents.type || ''))
      ) {
        fromContents = parseBannerPoll(contents)
      } else if (
        contents.type === 'Poll' ||
        (contents as { choices?: unknown }).choices
      ) {
        fromContents = parsePollNode(contents as Parameters<typeof parsePollNode>[0])
      }
    }

    if (fromHeader || fromContents) {
      return mergePollState(fromHeader, fromContents || {
        pollId: fromHeader!.pollId,
        question: fromHeader!.question,
        choices: fromHeader!.choices,
        totalVotes: fromHeader!.totalVotes,
        closed: false,
        voteEndpoints: new Map()
      })
    }
  }

  if (
    node.type === 'UpdateLiveChatPollAction' ||
    /UpdateLiveChatPoll/i.test(String(node.type || ''))
  ) {
    const poll = node.poll_to_update
    if (poll && (poll.choices || poll.live_chat_poll_id)) {
      const parsed = parsePollNode(poll)
      if (parsed) {
        // pergunta no header do update (se existir)
        const hq = textOf(poll.header?.poll_question).trim()
        if (hq) parsed.question = hq
        const hm = textOf(poll.header?.metadata).trim()
        if (hm && !parsed.totalVotes) parsed.totalVotes = hm
        return parsed
      }
    }
  }

  // RemoveBanner NÃO encerra enquete: o YT usa o mesmo comando p/ pin de msg,
  // raids, etc. → gerava “encerrada” falso em loop.
  if (
    node.type === 'RemoveBannerForLiveChatCommand' ||
    /RemoveBanner/i.test(String(node.type || ''))
  ) {
    return null
  }

  return null
}

/** Varredura no JSON cru (caso o Parser não emita o type) */
export function parsePollFromRawAction(action: unknown): ParsedLivePoll | null {
  if (!action || typeof action !== 'object') return null
  const found: ParsedLivePoll[] = []

  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 14) return
    if (Array.isArray(node)) {
      for (const x of node) visit(x, depth + 1)
      return
    }
    const o = node as Record<string, unknown>

    if (o.pollHeaderRenderer && typeof o.pollHeaderRenderer === 'object') {
      const r = o.pollHeaderRenderer as {
        pollQuestion?: unknown
        metadataText?: unknown
      }
      const p = parseBannerPoll({
        poll_question: r.pollQuestion,
        metadata: r.metadataText,
        choices: []
      })
      if (p) found.push(p)
    }

    if (o.liveChatBannerPollRenderer && typeof o.liveChatBannerPollRenderer === 'object') {
      const r = o.liveChatBannerPollRenderer as {
        pollQuestion?: unknown
        pollChoices?: Array<{
          pollOptionId?: string
          text?: unknown
          votePercentageIfSelected?: unknown
          voteRatioIfSelected?: number
          selectServiceEndpoint?: unknown
        }>
      }
      const choices = (r.pollChoices || []).map((c, i) => {
        const text = textOf(c.text).trim() || `Opção ${i + 1}`
        return {
          text,
          option_id: c.pollOptionId,
          select_endpoint: c.selectServiceEndpoint,
          vote_ratio_if_selected:
            typeof c.voteRatioIfSelected === 'number' ? c.voteRatioIfSelected : null,
          vote_percentage_if_selected: c.votePercentageIfSelected
        }
      })
      const p = parsePollNode({
        question: r.pollQuestion,
        choices
      })
      if (p) found.push(p)
    }

    if (o.pollRenderer && typeof o.pollRenderer === 'object') {
      const r = o.pollRenderer as {
        choices?: Array<Record<string, unknown>>
        totalVotes?: unknown
        liveChatPollId?: string
        type?: string
      }
      const mapped = {
        choices: (r.choices || []).map((c) => ({
          text: c.text,
          option_id:
            typeof c.pollOptionId === 'string'
              ? c.pollOptionId
              : typeof c.optionId === 'string'
                ? c.optionId
                : undefined,
          select_endpoint: c.selectServiceEndpoint,
          deselect_endpoint: c.deselectServiceEndpoint,
          vote_ratio_if_selected:
            typeof c.voteRatioIfSelected === 'number' ? c.voteRatioIfSelected : null,
          vote_percentage_if_selected: c.votePercentageIfSelected,
          vote_ratio_if_not_selected:
            typeof c.voteRatioIfNotSelected === 'number'
              ? c.voteRatioIfNotSelected
              : null,
          vote_percentage_if_not_selected: c.votePercentageIfNotSelected
        })),
        total_votes: r.totalVotes,
        live_chat_poll_id: r.liveChatPollId
      }
      const p = parsePollNode(mapped)
      if (p) found.push(p)
    }

    // entidades de estado (percentuais às vezes só aqui)
    if (
      o.payload &&
      typeof o.payload === 'object' &&
      (o as { type?: string }).type === 'liveChatPollStateEntity' // raro
    ) {
      /* skip */
    }

    if (o.updateLiveChatPollAction) visit(o.updateLiveChatPollAction, depth + 1)
    if (o.pollToUpdate) visit(o.pollToUpdate, depth + 1)
    if (o.addBannerToLiveChatCommand) visit(o.addBannerToLiveChatCommand, depth + 1)
    if (o.bannerRenderer) visit(o.bannerRenderer, depth + 1)
    if (o.liveChatBannerRenderer) visit(o.liveChatBannerRenderer, depth + 1)
    if (o.header) visit(o.header, depth + 1)
    if (o.contents) visit(o.contents, depth + 1)

    // NÃO tratar removeBanner como fim de enquete (ver parsePollFromAction)

    for (const [k, v] of Object.entries(o)) {
      if (
        k === 'loggingDirectives' ||
        k === 'trackingParams' ||
        k === 'clickTrackingParams'
      ) {
        continue
      }
      if (typeof v === 'object' && v) visit(v, depth + 1)
    }
  }

  visit(action, 0)

  // Prefer: tem pergunta real + endpoints + percentuais
  found.sort((a, b) => {
    const score = (p: ParsedLivePoll) =>
      (isPlaceholderQuestion(p.question) ? 0 : 4) +
      (p.voteEndpoints.size > 0 ? 2 : 0) +
      (p.choices.some((c) => c.votePercent || c.voteRatio != null) ? 2 : 0) +
      (p.totalVotes ? 1 : 0) +
      p.choices.length * 0.1
    return score(b) - score(a)
  })

  // Se um tem pergunta e outro tem % / endpoints, funde os top 2
  if (found.length >= 2) {
    return mergePollState(found[0]!, found[1]!)
  }
  return found[0] || null
}

export function mergePollState(
  prev: ParsedLivePoll | null,
  next: ParsedLivePoll
): ParsedLivePoll {
  // Fechamento: só aceita se já tínhamos enquete com opções
  if (next.closed) {
    if (!prev || !prev.choices.length) {
      return prev || next
    }
    return {
      pollId: prev.pollId || next.pollId,
      question: prev.question || '',
      choices: prev.choices,
      totalVotes: prev.totalVotes,
      closed: true,
      selectedOptionId: prev.selectedOptionId,
      voteEndpoints: prev.voteEndpoints || new Map()
    }
  }

  // Update só de metadata (header) sem choices → não apaga opções
  const nextMetaOnly =
    !next.choices.length ||
    !!(next as ParsedLivePoll & { _metaOnly?: boolean })._metaOnly

  if (!prev) {
    // Nunca inicia enquete sem opções
    if (nextMetaOnly || !next.choices.length) {
      return next.choices.length
        ? next
        : {
            ...next,
            choices: [],
            question: next.question || '',
            // marcador: inválido até ter choices
            pollId: next.pollId || 'pending'
          }
    }
    return {
      ...next,
      totalVotes: cleanTotalVotes(next.totalVotes) || next.totalVotes,
      question: isPlaceholderQuestion(next.question)
        ? next.question || 'Enquete'
        : next.question
    }
  }

  // prev existe, next sem choices → só atualiza pergunta/total
  if (nextMetaOnly) {
    return {
      ...prev,
      question: !isPlaceholderQuestion(next.question)
        ? next.question
        : prev.question,
      totalVotes:
        cleanTotalVotes(next.totalVotes) ||
        next.totalVotes ||
        prev.totalVotes,
      closed: false,
      selectedOptionId: prev.selectedOptionId
    }
  }

  const voteEndpoints = new Map(prev.voteEndpoints || [])
  for (const [k, v] of next.voteEndpoints) voteEndpoints.set(k, v)

  // Nunca reduzir o número de opções (update parcial)
  const baseChoices =
    next.choices.length >= prev.choices.length ? next.choices : prev.choices
  const otherChoices =
    next.choices.length >= prev.choices.length ? prev.choices : next.choices

  const choices: LivePollChoice[] = baseChoices.map((c, i) => {
    const match =
      otherChoices.find((p) => p.optionId === c.optionId) ||
      otherChoices.find((p) => p.text.toLowerCase() === c.text.toLowerCase()) ||
      otherChoices[i]
    const text = c.text || match?.text || `Opção ${i + 1}`
    const optionId = stableOptionId(
      text,
      i,
      c.optionId.startsWith('opt-') && match && !match.optionId.startsWith('opt-')
        ? match.optionId
        : c.optionId || match?.optionId
    )
    // Prefer % novas; se next não trouxe, mantém as antigas
    const voteRatio = c.voteRatio ?? match?.voteRatio
    const votePercent = c.votePercent || match?.votePercent
    return {
      optionId,
      text,
      voteRatio,
      votePercent
    }
  })

  if (next.voteEndpoints.size) {
    next.choices.forEach((c, i) => {
      const ep = next.voteEndpoints.get(c.optionId)
      if (ep && choices[i]) voteEndpoints.set(choices[i]!.optionId, ep)
    })
  }

  const question = !isPlaceholderQuestion(next.question)
    ? next.question
    : !isPlaceholderQuestion(prev.question)
      ? prev.question
      : next.question || prev.question || 'Enquete'

  return {
    pollId:
      (next.pollId &&
      next.pollId !== '__closed__' &&
      !next.pollId.startsWith('banner-') &&
      !next.pollId.startsWith('meta-')
        ? next.pollId
        : null) ||
      (prev.pollId && prev.pollId !== '__closed__' ? prev.pollId : null) ||
      next.pollId ||
      prev.pollId ||
      'poll',
    question,
    choices: choices.length ? choices : prev.choices,
    totalVotes:
      cleanTotalVotes(next.totalVotes) ||
      next.totalVotes ||
      cleanTotalVotes(prev.totalVotes) ||
      prev.totalVotes,
    closed: false,
    selectedOptionId: prev.selectedOptionId,
    voteEndpoints
  }
}

/**
 * Assinatura p/ UI. Total de votos arredondado em faixas p/ não
 * re-render a cada +1 voto (só quando % ou pergunta mudam, ou total “salta”).
 */
export function pollFingerprint(poll: ParsedLivePoll | LivePollState): string {
  const totalNum = parseVoteCount(poll.totalVotes)
  // bucket de ~50 votos p/ menos churn; % mudam com fingerprint das choices
  const totalBucket =
    totalNum != null ? String(Math.floor(totalNum / 50) * 50) : poll.totalVotes || ''
  return [
    poll.pollId,
    poll.question,
    poll.closed ? '1' : '0',
    poll.selectedOptionId || '',
    totalBucket,
    poll.choices
      .map(
        (c) =>
          `${c.optionId}|${c.text}|${c.votePercent || ''}|${c.voteRatio ?? ''}`
      )
      .join(';')
  ].join('::')
}

/** Só as % (p/ log / throttle) */
export function pollPercentsKey(poll: ParsedLivePoll | LivePollState): string {
  return poll.choices.map((c) => c.votePercent || '').join('|')
}

/**
 * Chaves p/ “utilizador fechou esta enquete” — mesma pergunta/opções
 * não reaparece; outra enquete (pergunta diferente) sim.
 */
export function pollDismissKeys(poll: {
  pollId?: string
  question?: string
  choices?: Array<{ text?: string }>
}): string[] {
  const q = (poll.question || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  const opts = (poll.choices || [])
    .map((c) =>
      (c.text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
    )
    .filter(Boolean)
    .join('|')
    .slice(0, 160)
  const keys: string[] = []
  if (poll.pollId && poll.pollId !== '__closed__' && !poll.pollId.startsWith('meta-')) {
    keys.push(`id:${poll.pollId}`)
  }
  if (q) keys.push(`q:${q}`)
  if (q && opts) keys.push(`qo:${q}::${opts}`)
  return keys
}

export function parseVoteCount(raw: string | undefined): number | null {
  if (!raw) return null
  const m = raw.replace(/\u00a0/g, ' ').match(/([\d.,]+)\s*(votes?|votos?)?/i)
  if (!m) return null
  const n = parseInt(m[1]!.replace(/[.,\s]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

/** Extrai só o trecho “2,867 votes” do metadata do header */
export function cleanTotalVotes(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const m = raw.match(
    /([\d.,\s]+)\s*(votes?|votos?|vote|voting)/i
  )
  if (m) return `${m[1].replace(/\s/g, '').trim()} ${/voto/i.test(m[2]) ? 'votos' : 'votes'}`
  // se já for curto, mantém
  if (raw.length < 40) return raw
  return raw
}

export function toPublicPoll(
  poll: ParsedLivePoll,
  videoId: string
): LivePollState {
  return {
    pollId: poll.pollId,
    question: poll.question || 'Enquete',
    choices: poll.choices.map((c) => ({
      ...c,
      votePercent:
        c.votePercent && !/^n\/?a$/i.test(c.votePercent)
          ? c.votePercent
          : ratioToPercent(c.voteRatio)
    })),
    totalVotes: cleanTotalVotes(poll.totalVotes) || poll.totalVotes,
    closed: poll.closed,
    selectedOptionId: poll.selectedOptionId,
    videoId
  }
}

/**
 * Cara no JSON inteiro por %/ratio e associa às opções pelo texto.
 * O YT manda totalVotes no header, mas as % por opção às vezes só em
 * ramos aninhados / campos com nomes que mudam.
 */
export function harvestChoiceVotesFromTree(
  data: unknown,
  choiceTexts: string[]
): Map<string, { ratio?: number; percent?: string }> {
  const out = new Map<string, { ratio?: number; percent?: string }>()
  if (!choiceTexts.length || !data) return out

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const texts = choiceTexts.map(norm)

  const matchText = (t: string): string | undefined => {
    if (!t) return undefined
    const n = norm(t)
    for (let i = 0; i < texts.length; i++) {
      const ct = texts[i]!
      if (!ct) continue
      if (n === ct || n.includes(ct.slice(0, 12)) || ct.includes(n.slice(0, 12))) {
        return choiceTexts[i]
      }
    }
    return undefined
  }

  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 18) return
    if (Array.isArray(node)) {
      for (const x of node) visit(x, depth + 1)
      return
    }
    const o = node as Record<string, unknown>

    // texto deste nó
    const label =
      textOf(o.text) ||
      textOf(o.simpleText) ||
      textOf(o.label) ||
      textOf((o.accessibility as { accessibilityData?: { label?: unknown } })?.accessibilityData
        ?.label) ||
      textOf((o.accessibilityData as { label?: unknown })?.label)

    const matched = matchText(label)
    if (matched) {
      const votes = extractChoiceVotes(o)
      // fallback: qualquer % na subárvore deste nó (1 nível)
      if (!votes.percent) {
        const blob = JSON.stringify(o)
        const m = blob.match(/"(\d{1,3}(?:[.,]\d+)?)\s*%"/) || blob.match(/(\d{1,3})\s*%/)
        if (m) votes.percent = `${m[1]!.replace(',', '.')}%`
      }
      // accessibility label: "Option name, 42%"
      if (!votes.percent && label) {
        const m = label.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/)
        if (m) votes.percent = `${m[1]!.replace(',', '.')}%`
      }
      if (votes.percent || votes.ratio != null) {
        const prev = out.get(matched) || {}
        out.set(matched, {
          ratio: votes.ratio ?? prev.ratio,
          percent: votes.percent || prev.percent
        })
      }
    }

    // array de choices tipado
    for (const key of [
      'pollChoices',
      'choices',
      'poll_choices',
      'options',
      'pollOptions'
    ]) {
      const arr = o[key]
      if (!Array.isArray(arr)) continue
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue
        const it = item as Record<string, unknown>
        const t =
          textOf(it.text) ||
          textOf(it.choiceText) ||
          textOf(it.label) ||
          textOf(it.title)
        const mt = matchText(t) || (t ? t : undefined)
        const votes = extractChoiceVotes(it)
        if (!votes.percent) {
          const blob = JSON.stringify(it)
          const m = blob.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/)
          if (m) votes.percent = `${m[1]!.replace(',', '.')}%`
        }
        // vote counts absolutos?
        const count =
          typeof it.voteCount === 'number'
            ? it.voteCount
            : typeof it.numVotes === 'number'
              ? it.numVotes
              : undefined
        if (mt && (votes.percent || votes.ratio != null || count != null)) {
          const prev = out.get(mt) || {}
          out.set(mt, {
            ratio: votes.ratio ?? prev.ratio,
            percent: votes.percent || prev.percent
          })
          // guarda count no ratio temporário via percent se tivermos total depois
          if (count != null && !votes.percent) {
            ;(out.get(mt) as { _count?: number })._count = count
          }
        }
      }
    }

    for (const [k, v] of Object.entries(o)) {
      if (
        k === 'loggingDirectives' ||
        k === 'trackingParams' ||
        k === 'clickTrackingParams'
      ) {
        continue
      }
      if (typeof v === 'object' && v) visit(v, depth + 1)
    }
  }

  visit(data, 0)
  return out
}

/** Aplica harvest de % às choices de um poll existente */
export function applyHarvestedVotes(
  poll: ParsedLivePoll,
  harvested: Map<string, { ratio?: number; percent?: string; _count?: number }>
): ParsedLivePoll {
  if (!harvested.size) return poll

  // se temos counts absolutos, calcula %
  let totalCount = 0
  const counts = new Map<string, number>()
  for (const [text, v] of harvested) {
    const c = (v as { _count?: number })._count
    if (typeof c === 'number') {
      counts.set(text, c)
      totalCount += c
    }
  }

  const choices = poll.choices.map((c) => {
    const h =
      harvested.get(c.text) ||
      [...harvested.entries()].find(
        ([t]) =>
          t.toLowerCase().includes(c.text.slice(0, 10).toLowerCase()) ||
          c.text.toLowerCase().includes(t.slice(0, 10).toLowerCase())
      )?.[1]

    let voteRatio = c.voteRatio ?? h?.ratio
    let votePercent = c.votePercent || h?.percent

    if (!votePercent && !voteRatio && totalCount > 0) {
      const cnt =
        counts.get(c.text) ||
        [...counts.entries()].find(([t]) =>
          t.toLowerCase().includes(c.text.slice(0, 10).toLowerCase())
        )?.[1]
      if (typeof cnt === 'number') {
        voteRatio = cnt / totalCount
        votePercent = ratioToPercent(voteRatio)
      }
    }

    if (!votePercent && voteRatio != null) {
      votePercent = ratioToPercent(voteRatio)
    }

    return { ...c, voteRatio, votePercent }
  })

  return { ...poll, choices }
}

/**
 * Varre a resposta INTEIRA do get_live_chat (actions + frameworkUpdates/entities).
 * As % da enquete costumam vir em liveChatPollStateEntity, não só nas actions.
 */
/** Sample compacto p/ debug quando não há % */
export function findPollDebugSample(data: unknown): string | null {
  let best: string | null = null
  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 14 || best) return
    if (Array.isArray(node)) {
      for (const x of node) visit(x, depth + 1)
      return
    }
    const o = node as Record<string, unknown>
    const keys = Object.keys(o)
    const interesting = keys.filter((k) =>
      /poll|vote|choice|option|ratio|percent/i.test(k)
    )
    if (
      interesting.length >= 2 ||
      keys.some((k) => /pollChoices|voteRatio|votePercentage|pollOption/i.test(k))
    ) {
      try {
        // só 1º nível + nested choices curtas
        const slim: Record<string, unknown> = {}
        for (const k of keys.slice(0, 24)) {
          const v = o[k]
          if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            slim[k] = v
          } else if (Array.isArray(v)) {
            slim[k] = v.slice(0, 4).map((item) => {
              if (!item || typeof item !== 'object') return item
              const it = item as Record<string, unknown>
              const sk: Record<string, unknown> = {}
              for (const ik of Object.keys(it).slice(0, 16)) {
                const iv = it[ik]
                if (
                  iv == null ||
                  typeof iv === 'string' ||
                  typeof iv === 'number' ||
                  typeof iv === 'boolean'
                ) {
                  sk[ik] = iv
                } else if (typeof iv === 'object') {
                  sk[ik] = `{${Object.keys(iv as object).slice(0, 8).join(',')}}`
                }
              }
              return sk
            })
          } else {
            slim[k] = `{${Object.keys(v as object).slice(0, 10).join(',')}}`
          }
        }
        best = JSON.stringify(slim).slice(0, 1200)
      } catch {
        best = interesting.join(',')
      }
      return
    }
    for (const v of Object.values(o)) {
      if (typeof v === 'object' && v) visit(v, depth + 1)
    }
  }
  visit(data, 0)
  return best
}

export function extractPollsFromLiveChatResponse(data: unknown): ParsedLivePoll[] {
  if (!data || typeof data !== 'object') return []
  const found: ParsedLivePoll[] = []

  const push = (p: ParsedLivePoll | null): void => {
    if (!p || p.closed) {
      if (p?.closed) found.push(p)
      return
    }
    if (!p.choices.length && isPlaceholderQuestion(p.question)) return
    found.push(p)
  }

  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 16) return
    if (Array.isArray(node)) {
      for (const x of node) visit(x, depth + 1)
      return
    }
    const o = node as Record<string, unknown>

    // Entity batch (fonte principal das %)
    const entityKeys = [
      'liveChatPollStateEntity',
      'liveChatPollEntity',
      'pollStateEntity'
    ]
    for (const ek of entityKeys) {
      if (o[ek] && typeof o[ek] === 'object') {
        const e = o[ek] as Record<string, unknown>
        const rawChoices = (e.pollChoices ||
          e.choices ||
          e.poll_choices ||
          []) as Array<Record<string, unknown>>
        if (Array.isArray(rawChoices) && rawChoices.length) {
          const choices: ChoiceIn[] = rawChoices.map((c) => ({
            text: c.text || c.choiceText || c.label,
            option_id:
              (typeof c.pollOptionId === 'string' && c.pollOptionId) ||
              (typeof c.optionId === 'string' && c.optionId) ||
              (typeof c.id === 'string' && c.id) ||
              undefined,
            select_endpoint: c.selectServiceEndpoint || c.serviceEndpoint,
            vote_ratio_if_selected:
              typeof c.voteRatioIfSelected === 'number'
                ? c.voteRatioIfSelected
                : typeof c.voteRatio === 'number'
                  ? c.voteRatio
                  : typeof c.vote_ratio === 'number'
                    ? c.vote_ratio
                    : null,
            vote_percentage_if_selected:
              c.votePercentageIfSelected ||
              c.votePercentage ||
              c.vote_percentage ||
              c.percentage ||
              c.subtitle
          }))
          const p = parsePollNode({
            question: e.question || e.pollQuestion || e.poll_question,
            choices,
            total_votes:
              e.totalVotes || e.total_votes || e.metadataText || e.voteCount,
            live_chat_poll_id:
              (typeof e.pollId === 'string' && e.pollId) ||
              (typeof e.liveChatPollId === 'string' && e.liveChatPollId) ||
              undefined
          })
          push(p)
        }
      }
    }

    // actions / banners / pollRenderer (já existia)
    if (
      o.liveChatBannerPollRenderer ||
      o.pollRenderer ||
      o.pollHeaderRenderer ||
      o.updateLiveChatPollAction ||
      o.addBannerToLiveChatCommand
    ) {
      push(parsePollFromRawAction(o))
    }

    // mutation.payload
    if (o.payload && typeof o.payload === 'object') {
      visit(o.payload, depth + 1)
    }
    if (o.mutations && Array.isArray(o.mutations)) {
      for (const m of o.mutations) visit(m, depth + 1)
    }
    if (o.frameworkUpdates) visit(o.frameworkUpdates, depth + 1)
    if (o.entityBatchUpdate) visit(o.entityBatchUpdate, depth + 1)

    for (const [k, v] of Object.entries(o)) {
      if (
        k === 'loggingDirectives' ||
        k === 'trackingParams' ||
        k === 'clickTrackingParams' ||
        k === 'actions' // actions já processadas à parte; evita explosion
      ) {
        // ainda processa actions no top-level via parsePollFromRawAction abaixo
        if (k === 'actions' && Array.isArray(v)) {
          for (const a of v) push(parsePollFromRawAction(a))
        }
        continue
      }
      if (typeof v === 'object' && v) visit(v, depth + 1)
    }
  }

  visit(data, 0)

  // funde por pollId / pergunta
  const byKey = new Map<string, ParsedLivePoll>()
  for (const p of found) {
    if (p.closed) {
      byKey.set('__closed__', p)
      continue
    }
    const key =
      p.pollId && !p.pollId.startsWith('banner-')
        ? p.pollId
        : `q:${p.question}|${p.choices.map((c) => c.text).join('|')}`
    const prev = byKey.get(key)
    byKey.set(key, prev ? mergePollState(prev, p) : p)
  }

  return [...byKey.values()].filter((p) => !p.closed || p.pollId === '__closed__')
}
