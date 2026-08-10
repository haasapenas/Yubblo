import type { EmoteCatalog, EmoteCatalogItem } from '../../../../../shared/types'

export type PickerSource = 'youtube' | 'emoji' | '7tv'
export type PickerScope = 'channel' | 'global'

export interface PickerItem {
  key: string
  label: string
  insertText: string
  imageUrl?: string
  source: PickerSource
  scope?: PickerScope
  zeroWidth: boolean
}

export interface UnicodeEmojiInput {
  id: string
  name: string
  value: string
}

export function normalizeYoutubeItem(item: EmoteCatalogItem): PickerItem {
  return {
    key: `youtube:${item.id}`,
    label: item.name,
    insertText: item.name,
    imageUrl: item.url,
    source: 'youtube',
    scope: item.scope,
    zeroWidth: false
  }
}

export function normalizeSeventvItem(item: EmoteCatalogItem): PickerItem {
  return {
    key: `7tv:${item.id}`,
    label: item.name,
    insertText: item.name,
    imageUrl: item.url,
    source: '7tv',
    scope: item.scope,
    zeroWidth: item.zeroWidth === true
  }
}

export function normalizeUnicodeItem(item: UnicodeEmojiInput): PickerItem {
  return {
    key: `emoji:${item.id}`,
    label: item.name,
    insertText: item.value,
    source: 'emoji',
    zeroWidth: false
  }
}

export function normalizeCatalogItems(
  source: 'youtube' | '7tv',
  items: EmoteCatalogItem[]
): PickerItem[] {
  const normalize = source === 'youtube'
    ? normalizeYoutubeItem
    : normalizeSeventvItem
  return items.map(normalize)
}

export function filterPickerItems(items: PickerItem[], query: string): PickerItem[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return items
  return items.filter((item) =>
    item.label.toLocaleLowerCase().includes(normalized) ||
    item.insertText.toLocaleLowerCase().includes(normalized)
  )
}

export function chooseDefaultSource(catalog: EmoteCatalog): {
  source: PickerSource
  scope: PickerScope
} {
  if (catalog.stvChannel.length > 0) return { source: '7tv', scope: 'channel' }
  if (catalog.stvGlobal.length > 0) return { source: '7tv', scope: 'global' }
  if (catalog.youtube.length > 0) return { source: 'youtube', scope: 'global' }
  return { source: 'emoji', scope: 'global' }
}
