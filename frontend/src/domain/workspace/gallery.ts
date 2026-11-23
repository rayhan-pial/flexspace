import type { Command } from './commands'
import { ASSET_KEYS, MAX_LIST_ITEMS, MAX_TEXT } from './constants'
import { collectIds } from './lifecycle'
import { editItems } from './lists'
import type { AssetKey, GalleryItem, WorkspaceConfig } from './types'

/*
 * Typed commands for the images of a Gallery widget. `assetKey` selects a bundled image from the
 * code-owned allowlist; there is no upload and no URL. Item ids are stable once created.
 */

const length = (text: string) => Array.from(text).length
const isAssetKey = (key: string): key is AssetKey => (ASSET_KEYS as readonly string[]).includes(key)

const edit = (widgetId: string, change: (items: GalleryItem[], config: WorkspaceConfig) => GalleryItem[] | string): Command =>
  editItems(widgetId, 'gallery', 'items', 'a gallery', change)

export function addGalleryItem(widgetId: string, itemId: string, assetKey: string): Command {
  return edit(widgetId, (items, config) => {
    if (!isAssetKey(assetKey)) return `${assetKey} is not a bundled image.`
    if (items.length >= MAX_LIST_ITEMS) return `A gallery can hold at most ${MAX_LIST_ITEMS} images.`
    if (collectIds(config).has(itemId)) return `The id ${itemId} is already in use.`
    return [...items, { id: itemId, assetKey, alt: '', caption: '' }]
  })
}

export interface GalleryItemPatch { assetKey?: string; alt?: string; caption?: string }

export function updateGalleryItem(widgetId: string, itemId: string, patch: GalleryItemPatch): Command {
  return edit(widgetId, (items) => {
    const index = items.findIndex((i) => i.id === itemId)
    if (index === -1) return `Image ${itemId} was not found.`
    if (patch.assetKey !== undefined && !isAssetKey(patch.assetKey)) return `${patch.assetKey} is not a bundled image.`
    for (const [name, value] of [['Alt text', patch.alt], ['Caption', patch.caption]] as const) {
      if (value !== undefined && length(value) > MAX_TEXT) return `${name} can be at most ${MAX_TEXT} characters.`
    }
    const current = items[index]
    const next: GalleryItem = {
      ...current,
      ...(patch.assetKey !== undefined && { assetKey: patch.assetKey as AssetKey }),
      ...(patch.alt !== undefined && { alt: patch.alt }),
      ...(patch.caption !== undefined && { caption: patch.caption }),
    }
    if (next.assetKey === current.assetKey && next.alt === current.alt && next.caption === current.caption) return items
    return items.map((i, n) => (n === index ? next : i))
  })
}

export function removeGalleryItem(widgetId: string, itemId: string): Command {
  return edit(widgetId, (items) => (items.some((i) => i.id === itemId) ? items.filter((i) => i.id !== itemId) : `Image ${itemId} was not found.`))
}
