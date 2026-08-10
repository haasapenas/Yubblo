import type { RawModEndpoint } from './moderation-parser'

export interface HiddenUserEntry {
  channelId: string
  name: string
  messageId: string
  videoId: string
  unhide?: RawModEndpoint
  hideParams?: string
}

export interface HiddenUserSummary {
  channelId: string
  name: string
  canUnhide: boolean
}

export class HiddenUsers {
  private readonly entries = new Map<string, HiddenUserEntry>()

  constructor(private readonly onChanged?: () => void) {}

  get(channelId: string): HiddenUserEntry | undefined {
    return this.entries.get(channelId)
  }

  has(channelId: string): boolean {
    return this.entries.has(channelId)
  }

  track(
    channelId: string,
    name: string,
    messageId: string,
    videoId: string,
    hideParams?: string
  ): void {
    const previous = this.entries.get(channelId)
    this.entries.set(channelId, {
      channelId,
      name: name || previous?.name || channelId,
      messageId,
      videoId,
      unhide: previous?.unhide,
      hideParams: hideParams || previous?.hideParams
    })
    this.onChanged?.()
  }

  clear(channelId: string): void {
    if (this.entries.delete(channelId)) this.onChanged?.()
  }

  rememberUnhide(
    channelId: string,
    endpoint: RawModEndpoint,
    fallback: { name: string; messageId: string; videoId: string }
  ): void {
    const previous = this.entries.get(channelId)
    this.entries.set(channelId, {
      channelId,
      name: fallback.name || previous?.name || channelId,
      messageId: previous?.messageId || fallback.messageId,
      videoId: previous?.videoId || fallback.videoId,
      unhide: endpoint,
      hideParams: previous?.hideParams
    })
    this.onChanged?.()
  }

  findChannelByMessage(messageId: string): string | undefined {
    for (const entry of this.entries.values()) {
      if (entry.messageId === messageId) return entry.channelId
    }
    return undefined
  }

  list(videoId?: string | null): HiddenUserSummary[] {
    return [...this.entries.values()]
      .filter((entry) => !videoId || entry.videoId === videoId)
      .map((entry) => ({
        channelId: entry.channelId,
        name: entry.name,
        canUnhide: !!entry.unhide
      }))
  }

  resolveUnhide(
    endpoints: RawModEndpoint[],
    channelId: string
  ): RawModEndpoint | null {
    const entry = this.entries.get(channelId)
    const byKind = endpoints.find((endpoint) => endpoint.kind === 'unhide')
    if (byKind) return { ...byKind, kind: 'unhide' }

    const byLabel = endpoints.find((endpoint) => {
      const label = (endpoint.label || '').toLocaleLowerCase()
      return [
        'voltar a exibir',
        'exibir o usu',
        'exibir usu',
        'show user',
        'unhide',
        'show this user'
      ].some((term) => label.includes(term))
    })
    if (byLabel) return { ...byLabel, kind: 'unhide' }

    const hideLike = endpoints.filter((endpoint) => {
      const label = (endpoint.label || '').toLocaleLowerCase()
      return (
        endpoint.kind === 'hide' ||
        label.includes('hide user') ||
        label.includes('ocultar usu') ||
        label.includes('ocultar o usu')
      )
    })

    if (entry?.hideParams && hideLike.length > 0) {
      const different = hideLike.find(
        (endpoint) => String(endpoint.body.params || '') !== entry.hideParams
      )
      if (different) return this.asUnhide(different)
    }

    if (hideLike.length >= 2) {
      const first = hideLike[0]!
      const second = hideLike[1]!
      if (String(first.body.params || '') !== String(second.body.params || '')) {
        const candidate =
          entry?.hideParams && String(first.body.params || '') === entry.hideParams
            ? second
            : first
        return this.asUnhide(candidate)
      }
    }

    return null
  }

  private asUnhide(endpoint: RawModEndpoint): RawModEndpoint {
    return {
      ...endpoint,
      kind: 'unhide',
      iconType: endpoint.iconType.startsWith('UNHIDE')
        ? endpoint.iconType
        : `UNHIDE_${endpoint.iconType}`,
      label: endpoint.label || 'Voltar a exibir usuario'
    }
  }
}
