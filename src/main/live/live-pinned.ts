/**
 * Mensagem fixada (pinned) do YouTube Live Chat.
 * AddBannerToLiveChatCommand + contents LiveChatTextMessage (não poll).
 */
import type { LivePinnedMessage } from '../../shared/types'

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

function isPollContents(type: string | undefined): boolean {
  const t = String(type || '')
  return /Poll|BannerPoll/i.test(t)
}

function looksPinnedHeader(headerText: string, iconType?: string, bannerType?: string): boolean {
  const h = headerText.toLowerCase()
  const icon = String(iconType || '').toUpperCase()
  const bt = String(bannerType || '').toUpperCase()
  if (bt.includes('PINNED') || bt.includes('PIN')) return true
  if (icon.includes('KEEP') || icon.includes('PIN') || icon.includes('PUSH_PIN')) return true
  if (
    h.includes('fixad') ||
    h.includes('pinned') ||
    h.includes('pin by') ||
    h.includes('fixado por') ||
    h.includes('épingl') ||
    h.includes('anclad')
  ) {
    return true
  }
  return false
}

export type ParsedPinned =
  | { kind: 'set'; pin: LivePinnedMessage }
  | { kind: 'clear'; targetActionId?: string }

/** Action parseada (youtubei) */
export function parsePinnedFromAction(action: unknown): ParsedPinned | null {
  if (!action || typeof action !== 'object') return null
  const node = action as {
    type?: string
    target_action_id?: string
    banner?: {
      header?: { type?: string; text?: unknown; icon_type?: string }
      contents?: {
        type?: string
        id?: string
        message?: unknown
        author?: { name?: unknown; id?: string }
      }
      action_id?: string
      target_id?: string
      banner_type?: string
    }
  }

  if (
    node.type === 'RemoveBannerForLiveChatCommand' ||
    /RemoveBanner/i.test(String(node.type || ''))
  ) {
    return {
      kind: 'clear',
      targetActionId: node.target_action_id
    }
  }

  if (
    node.type !== 'AddBannerToLiveChatCommand' &&
    !/AddBanner/i.test(String(node.type || ''))
  ) {
    return null
  }

  const banner = node.banner
  if (!banner?.contents) return null
  const ctype = banner.contents.type
  if (isPollContents(ctype)) return null

  // Mensagem de texto fixada (ou paid/membership raros)
  const isMsg =
    !ctype ||
    /LiveChatTextMessage|TextMessage|PaidMessage|Membership/i.test(String(ctype))
  if (!isMsg) return null

  const headerText = textOf(banner.header?.text)
  const iconType = banner.header?.icon_type
  const bannerType = banner.banner_type
  // Se não parece pin e não é text message explícito, ignora
  if (
    !looksPinnedHeader(headerText, iconType, bannerType) &&
    !/LiveChatTextMessage|TextMessage/i.test(String(ctype || ''))
  ) {
    // Ainda aceita text message em banner (caso comum de pin sem header PT)
    if (!/LiveChatTextMessage|TextMessage/i.test(String(ctype || ''))) {
      return null
    }
  }

  const authorName =
    textOf(banner.contents.author?.name) ||
    textOf((banner.contents as { authorName?: unknown }).authorName) ||
    'Alguém'
  const authorChannelId =
    banner.contents.author?.id ||
    (banner.contents as { authorExternalChannelId?: string })
      .authorExternalChannelId
  const text = textOf(banner.contents.message).trim()
  if (!text && !authorName) return null

  const messageId = banner.contents.id || banner.target_id || ''
  const actionId = banner.action_id || ''

  return {
    kind: 'set',
    pin: {
      id: actionId || messageId || `pin-${Date.now()}`,
      messageId: messageId || undefined,
      actionId: actionId || undefined,
      authorName,
      authorChannelId,
      text: text || '(mensagem fixada)',
      headerText: headerText || 'Fixado',
      videoId: undefined
    }
  }
}

/** JSON cru */
export function parsePinnedFromRawAction(action: unknown): ParsedPinned | null {
  if (!action || typeof action !== 'object') return null
  let found: ParsedPinned | null = null

  const visit = (node: unknown, depth: number): void => {
    if (found || !node || typeof node !== 'object' || depth > 12) return
    if (Array.isArray(node)) {
      for (const x of node) visit(x, depth + 1)
      return
    }
    const o = node as Record<string, unknown>

    if (o.removeBannerForLiveChatCommand != null) {
      const r = o.removeBannerForLiveChatCommand as { targetActionId?: string }
      found = { kind: 'clear', targetActionId: r?.targetActionId }
      return
    }

    if (o.addBannerToLiveChatCommand || o.liveChatBannerRenderer) {
      const bannerRoot =
        (o.addBannerToLiveChatCommand as { bannerRenderer?: unknown })
          ?.bannerRenderer ||
        o.liveChatBannerRenderer ||
        o.bannerRenderer
      if (bannerRoot && typeof bannerRoot === 'object') {
        const br =
          (bannerRoot as { liveChatBannerRenderer?: unknown })
            .liveChatBannerRenderer || bannerRoot
        if (br && typeof br === 'object') {
          const b = br as {
            actionId?: string
            targetId?: string
            bannerType?: string
            header?: {
              liveChatBannerHeaderRenderer?: {
                text?: unknown
                icon?: { iconType?: string }
              }
            }
            contents?: {
              liveChatTextMessageRenderer?: Record<string, unknown>
              liveChatPaidMessageRenderer?: Record<string, unknown>
              liveChatBannerPollRenderer?: unknown
            }
          }
          if (b.contents?.liveChatBannerPollRenderer) {
            // poll — não é pin
          } else {
            const msgR =
              b.contents?.liveChatTextMessageRenderer ||
              b.contents?.liveChatPaidMessageRenderer
            if (msgR) {
              const headerR = b.header?.liveChatBannerHeaderRenderer
              const headerText = textOf(headerR?.text)
              const iconType = headerR?.icon?.iconType
              const author = msgR.authorName || msgR.authorExternalChannelId
              const authorName =
                textOf(msgR.authorName) ||
                textOf((msgR.author as { name?: unknown })?.name) ||
                'Alguém'
              const authorChannelId =
                (typeof msgR.authorExternalChannelId === 'string' &&
                  msgR.authorExternalChannelId) ||
                (typeof (msgR.author as { id?: string })?.id === 'string'
                  ? (msgR.author as { id: string }).id
                  : undefined)
              const text = textOf(msgR.message).trim()
              const messageId =
                (typeof msgR.id === 'string' && msgR.id) || b.targetId || ''
              const actionId = b.actionId || ''
              if (
                text ||
                looksPinnedHeader(headerText, iconType, b.bannerType)
              ) {
                found = {
                  kind: 'set',
                  pin: {
                    id: actionId || messageId || `pin-${Date.now()}`,
                    messageId: messageId || undefined,
                    actionId: actionId || undefined,
                    authorName,
                    authorChannelId,
                    text: text || '(mensagem fixada)',
                    headerText: headerText || 'Fixado'
                  }
                }
                return
              }
              void author
            }
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

  visit(action, 0)
  return found
}

export function pinnedFingerprint(pin: LivePinnedMessage): string {
  return `${pin.id}|${pin.messageId || ''}|${pin.authorName}|${pin.text.slice(0, 120)}`
}

export function pinnedDismissKey(pin: LivePinnedMessage): string {
  return `pin:${pin.messageId || pin.id}|${pin.text.slice(0, 80).toLowerCase()}`
}
