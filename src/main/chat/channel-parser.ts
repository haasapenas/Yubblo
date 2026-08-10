import type { LiveStreamOption } from '../../shared/types'
import { textOf } from './message-parser'

export function isVideoId11(s: string | undefined | null): s is string {
  return typeof s === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(s)
}
/**
 * Extrai videoId de nós do feed (Video/GridVideo **e** LockupView moderno = content_id).
 */
export function videoIdFromNode(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null
  const o = v as {
    video_id?: string
    content_id?: string
    id?: string
    videoId?: string
    contentId?: string
    endpoint?: { payload?: { videoId?: string }; videoId?: string }
    renderer_context?: {
      command_context?: { on_tap?: { payload?: { videoId?: string } } }
    }
  }
  if (isVideoId11(o.video_id)) return o.video_id
  if (isVideoId11(o.content_id)) return o.content_id
  if (isVideoId11(o.videoId)) return o.videoId
  if (isVideoId11(o.contentId)) return o.contentId
  if (isVideoId11(o.id)) return o.id
  const fromEp =
    o.endpoint?.payload?.videoId ||
    o.endpoint?.videoId ||
    o.renderer_context?.command_context?.on_tap?.payload?.videoId
  if (isVideoId11(fromEp)) return fromEp
  return null
}

/** Live só agendada / premiere — NÃO é escolha de chat ao vivo. */
export function looksUpcoming(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const o = v as {
    is_upcoming?: boolean | (() => boolean)
    upcoming?: unknown
    upcoming_text?: unknown
  }
  try {
    if (o.is_upcoming === true) return true
    if (typeof o.is_upcoming === 'function' && o.is_upcoming()) return true
  } catch {
    /* ignore */
  }
  if (o.upcoming != null && o.upcoming !== false) return true
  if (textOf(o.upcoming_text).trim()) return true
  try {
    const blob = JSON.stringify(v).toUpperCase()
    if (
      blob.includes('UPCOMING') ||
      blob.includes('AGENDAD') ||
      blob.includes('SCHEDULED') ||
      blob.includes('PREMIERE') ||
      blob.includes('ESTREIA') ||
      blob.includes('COMING SOON') ||
      blob.includes('EM BREVE') ||
      blob.includes('BADGE_STYLE_TYPE_UPCOMING') ||
      (blob.includes('THUMBNAILOVERLAYTIMESTAMPSTATUS') && blob.includes('UPCOMING'))
    ) {
      // se também tem LIVE_NOW explícito, não é só agendada
      if (blob.includes('BADGE_STYLE_TYPE_LIVE_NOW') || blob.includes('"STYLE":"LIVE"')) {
        return false
      }
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/** Parece transmissão AO VIVO agora (não agendada, não VOD). */
export function isVideoLiveNow(
  details: { is_live?: boolean; is_upcoming?: boolean; is_post_live_dvr?: boolean },
  endTimestamp?: unknown
): boolean {
  return details.is_live === true && details.is_upcoming !== true &&
    details.is_post_live_dvr !== true && !endTimestamp
}

/**
 * Só true quando a transmissão realmente ACABOU.
 * NÃO use para “ainda não começou” (upcoming / waiting room / link programado):
 * nesses casos o chat pode existir e o live-watch não deve derrubar o poller.
 */
export function isVideoDefinitelyEnded(
  details: { is_live?: boolean; is_upcoming?: boolean; is_post_live_dvr?: boolean },
  endTimestamp?: unknown
): boolean {
  // Sala de espera / premiere programada — chat pode estar aberto
  if (details.is_upcoming === true) return false
  if (details.is_post_live_dvr === true) return true
  if (endTimestamp != null && endTimestamp !== '') return true
  return false
}
export function looksLive(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  if (looksUpcoming(v)) return false
  const o = v as {
    is_live?: boolean | (() => boolean)
    thumbnail_overlays?: Array<{ type?: string; text?: unknown; style?: string }>
    badges?: Array<{ label?: string; style?: string }>
    metadata?: { title?: unknown; metadata?: unknown }
    content_image?: unknown
  }
  try {
    if (o.is_live === true) return true
    if (typeof o.is_live === 'function' && o.is_live()) return true
  } catch {
    /* getter pode falhar em nós parciais */
  }
  const overlays = (o.thumbnail_overlays || [])
    .map((x) => `${x.type || ''} ${textOf(x.text)} ${x.style || ''}`)
    .join(' ')
    .toUpperCase()
  if (overlays.includes('UPCOMING') || overlays.includes('AGENDAD')) return false
  if (overlays.includes('LIVE') || overlays.includes('AO VIVO')) return true
  const badges = (o.badges || [])
    .map((b) => `${b.label || ''} ${b.style || ''}`)
    .join(' ')
    .toUpperCase()
  if (badges.includes('UPCOMING') || badges.includes('AGENDAD') || badges.includes('PREMIERE')) {
    return false
  }
  if (
    badges.includes('LIVE_NOW') ||
    badges.includes('BADGE_STYLE_TYPE_LIVE_NOW') ||
    (badges.includes('LIVE') && !badges.includes('PREMIERE')) ||
    badges.includes('AO VIVO')
  ) {
    return true
  }
  // LockupView: preferir sinais fortes (LIVE_NOW), não qualquer "LIVE" no JSON
  try {
    const blob = JSON.stringify(v).toUpperCase()
    if (
      blob.includes('UPCOMING') ||
      blob.includes('AGENDAD') ||
      blob.includes('SCHEDULED') ||
      blob.includes('PREMIERE')
    ) {
      return false
    }
    if (
      blob.includes('BADGE_STYLE_TYPE_LIVE_NOW') ||
      blob.includes('AO VIVO') ||
      blob.includes('"STYLE":"LIVE"') ||
      (blob.includes('THUMBNAILOVERLAYTIMESTAMPSTATUS') && blob.includes('"STYLE":"LIVE"')) ||
      // multi-live secundárias costumam trazer "watching" / "assistindo"
      blob.includes('WATCHING NOW') ||
      blob.includes('ASSISTINDO AGORA') ||
      (blob.includes('WATCHING') && !blob.includes('VIEWS'))
    ) {
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

export function thumbUrlFromNode(v: unknown): string | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as {
    best_thumbnail?: { url?: string }
    thumbnails?: Array<{ url?: string }>
    thumbnail?: { url?: string; thumbnails?: Array<{ url?: string }> }
    content_image?: {
      image?: { sources?: Array<{ url?: string }> }
      sources?: Array<{ url?: string }>
      thumbnail?: Array<{ url?: string }>
    }
  }
  return (
    o.best_thumbnail?.url ||
    o.thumbnails?.[0]?.url ||
    o.thumbnail?.url ||
    o.thumbnail?.thumbnails?.[0]?.url ||
    o.content_image?.image?.sources?.[0]?.url ||
    o.content_image?.sources?.[0]?.url ||
    o.content_image?.thumbnail?.[0]?.url ||
    undefined
  )
}

export function titleFromNode(v: unknown): string {
  if (!v || typeof v !== 'object') return 'Transmissão'
  const o = v as {
    title?: unknown
    headline?: unknown
    accessibility?: { label?: unknown }
    metadata?: { title?: unknown }
  }
  const t =
    textOf(o.title) ||
    textOf(o.metadata?.title) ||
    textOf(o.headline) ||
    textOf(o.accessibility?.label)
  return t.trim() || 'Transmissão'
}

export function viewerTextFromNode(v: unknown): string | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as {
    short_view_count?: unknown
    view_count?: unknown
    short_view_count_text?: unknown
    view_count_text?: unknown
    metadata?: { metadata?: unknown }
  }
  const t =
    textOf(o.short_view_count) ||
    textOf(o.short_view_count_text) ||
    textOf(o.view_count) ||
    textOf(o.view_count_text)
  if (t.trim()) return t.trim()
  // LockupView: metadados secundários (views) às vezes em text runs
  try {
    const meta = o.metadata?.metadata
    if (meta) {
      const s = textOf(meta)
      if (s && /assist|view|watching|espect/i.test(s)) return s.trim()
    }
  } catch {
    /* ignore */
  }
  return undefined
}

export function liveOptionFromNode(
  v: unknown,
  channelName?: string
): LiveStreamOption | null {
  const videoId = videoIdFromNode(v)
  if (!videoId) return null
  const o = v as { author?: unknown }
  return {
    videoId,
    title: titleFromNode(v),
    channelName: channelName || textOf(o.author) || undefined,
    thumbnailUrl: thumbUrlFromNode(v),
    viewerText: viewerTextFromNode(v),
    isLive: looksLive(v)
  }
}

export function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\s+/g, '')
}
