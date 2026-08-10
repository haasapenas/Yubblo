type Rec = Record<string, unknown>
const rec = (v: unknown): Rec | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Rec : null

function varint(value: number): number[] { const out: number[] = []; do { let byte = value & 0x7f; value >>>= 7; if (value) byte |= 0x80; out.push(byte) } while (value); return out }
function bytes(value: string): number[] { return [...Buffer.from(value, 'utf8')] }
function field(number: number, value: number[]): number[] { return [...varint(number * 8 + 2), ...varint(value.length), ...value] }

/** Reproduz o protobuf usado pelo site no POST youtubei/v1/get_panel. */
export function buildChannelActivityParams(ownerChannelId: string, videoId: string, targetChannelId: string): string {
  if (!ownerChannelId || !videoId || !targetChannelId) return ''
  const live = field(1, field(5, [...field(1, bytes(ownerChannelId)), ...field(2, bytes(videoId))]))
  const target = field(2, field(1, bytes(targetChannelId)))
  const payload = field(132, [...live, ...target, 0x28, 0x01])
  return encodeURIComponent(Buffer.from(payload).toString('base64'))
}
export function extractChannelActivityParam(value: unknown): { authorChannelId: string; params: string } | null {
  const stack: unknown[] = [value]; let authorChannelId = ''; let params = ''
  while (stack.length) {
    const item = stack.pop(); if (Array.isArray(item)) { stack.push(...item); continue }
    const node = rec(item); if (!node) continue
    for (const [key, child] of Object.entries(node)) {
      if ((key === 'authorExternalChannelId' || key === 'author_external_channel_id') && typeof child === 'string') authorChannelId ||= child
      if (key === 'showEngagementPanelEndpoint' || key === 'show_engagement_panel_endpoint') {
        const endpoint = rec(child); const id = endpoint?.panelIdentifier ?? endpoint?.panel_identifier; const candidate = endpoint?.params
        if (id === 'PAlc_channel_activity' && typeof candidate === 'string' && candidate.length <= 4096) params ||= candidate
      }
      if (child && typeof child === 'object') stack.push(child)
    }
  }
  return authorChannelId && params ? { authorChannelId, params } : null
}
export class ChannelActivityParamIndex {
  private readonly values = new Map<string, string>()
  constructor(private readonly max = 500, private readonly keep = 300) {}
  set(id: string, params: string): void { if (!id || !params || params.length > 4096) return; this.values.delete(id); this.values.set(id, params); if (this.values.size > this.max) while (this.values.size > this.keep) this.values.delete(this.values.keys().next().value as string) }
  get(id: string): string | undefined { return this.values.get(id) }
  has(id: string): boolean { return this.values.has(id) }
  clear(): void { this.values.clear() }
  get size(): number { return this.values.size }
}
