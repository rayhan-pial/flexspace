import type { Command } from './commands'
import { fail, ok } from './commands'
import type { NavItem } from './types'

/*
 * Pure move primitives shared by every sortable group (navigation now; sections, stack cards, task
 * rows, gallery tiles later). A move names the item by its stable id; positions are resolved
 * against the current lists at commit time, never against indices captured when a drag began.
 */

export type Lists<T extends { id: string }> = Record<string, readonly T[]>

export interface MoveResult<T extends { id: string }> {
  lists: Lists<T>
  /** Where the item ended up. */
  toKey: string
  toIndex: number
}

/**
 * Remove `itemId` from whichever list holds it and insert it into `toKey` so that it ends at
 * `toIndex` (clamped to the destination). Exactly one copy of the item exists afterwards. Returns
 * `null` for an unknown item or list, and the *same* `lists` object when nothing changes.
 */
export function moveBetween<T extends { id: string }>(lists: Lists<T>, itemId: string, toKey: string, toIndex: number): MoveResult<T> | null {
  if (!Object.hasOwn(lists, toKey)) return null
  const fromKey = Object.keys(lists).find((key) => lists[key].some((item) => item.id === itemId))
  if (fromKey === undefined || !Number.isInteger(toIndex)) return null

  const item = lists[fromKey].find((entry) => entry.id === itemId)!
  const withoutItem = lists[fromKey].filter((entry) => entry.id !== itemId)
  const destination = fromKey === toKey ? withoutItem : [...lists[toKey]]
  const index = Math.min(Math.max(toIndex, 0), destination.length)

  const placed = [...destination.slice(0, index), item, ...destination.slice(index)]
  if (fromKey === toKey) {
    const same = placed.length === lists[fromKey].length && placed.every((entry, n) => entry === lists[fromKey][n])
    return { lists: same ? lists : { ...lists, [fromKey]: placed }, toKey, toIndex: index }
  }
  return { lists: { ...lists, [fromKey]: withoutItem, [toKey]: placed }, toKey, toIndex: index }
}

export type NavGroup = 'primaryItems' | 'secondaryItems'

/**
 * Move a navigation item within its group or into the other one (including an empty group). The
 * item's data is carried unchanged, ids stay unique, and the same config is returned for a no-op.
 */
export function moveNavItem(itemId: string, toGroup: NavGroup, toIndex: number): Command {
  return (config) => {
    const { navigation } = config
    const lists: Record<NavGroup, readonly NavItem[]> = { primaryItems: navigation.primaryItems, secondaryItems: navigation.secondaryItems }
    const moved = moveBetween(lists, itemId, toGroup, toIndex)
    if (!moved) return fail(`Navigation item ${itemId} or group ${toGroup} was not found.`)
    if (moved.lists === lists) return ok(config)
    return ok({
      ...config,
      navigation: {
        ...navigation,
        primaryItems: moved.lists.primaryItems as NavItem[],
        secondaryItems: moved.lists.secondaryItems as NavItem[],
      },
    })
  }
}
