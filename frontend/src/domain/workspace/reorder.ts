import type { Command } from './commands'
import { fail, ok } from './commands'
import { KNOWN_WIDGET_TYPES, MAX_LIST_ITEMS } from './constants'
import { settleSection } from './grid'
import { defaultSizeFor, repackLayout } from './placement'
import type { GridRect, NavItem, Section, Widget } from './types'

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

/**
 * Like `moveBetween`, but `toVisibleIndex` counts only items that are not hidden, because a
 * sortable surface draws only those. The item is inserted just before the visible item currently at
 * that index (or at the end), so hidden items keep their places in the stored array.
 */
export function moveAmongVisible<T extends { id: string; hidden: boolean }>(
  lists: Lists<T>,
  itemId: string,
  toKey: string,
  toVisibleIndex: number,
): MoveResult<T> | null {
  if (!Object.hasOwn(lists, toKey) || !Number.isInteger(toVisibleIndex)) return null
  const fromKey = Object.keys(lists).find((key) => lists[key].some((item) => item.id === itemId))
  if (fromKey === undefined) return null

  const destination = fromKey === toKey ? lists[toKey].filter((item) => item.id !== itemId) : lists[toKey]
  const visible = destination.filter((item) => !item.hidden)
  const clamped = Math.min(Math.max(toVisibleIndex, 0), visible.length)

  // Moving an item to the visible position it already has changes nothing, even if hidden items sit around it.
  if (fromKey === toKey) {
    const item = lists[fromKey].find((entry) => entry.id === itemId)!
    if (!item.hidden && lists[fromKey].filter((entry) => !entry.hidden).indexOf(item) === clamped) {
      return { lists, toKey, toIndex: lists[fromKey].indexOf(item) }
    }
  }

  const anchor = visible[clamped]
  const lastVisible = visible.at(-1)
  // Before the visible item now at that position; past the last one, right after it (hidden trailing items stay last).
  const fullIndex = anchor ? destination.indexOf(anchor) : lastVisible ? destination.indexOf(lastVisible) + 1 : destination.length
  return moveBetween(lists, itemId, toKey, fullIndex)
}

/** Reorder workspace sections (root only: a section can never be nested inside another). */
export function moveSection(sectionId: string, toVisibleIndex: number): Command {
  return (config) => {
    const lists = { root: config.sections }
    const moved = moveAmongVisible(lists, sectionId, 'root', toVisibleIndex)
    if (!moved) return fail(`Section ${sectionId} was not found.`)
    if (moved.lists === lists) return ok(config)
    return ok({ ...config, sections: [...moved.lists.root] })
  }
}

const isSchemaKnown = (type: string): boolean => (KNOWN_WIDGET_TYPES as readonly string[]).includes(type)

/**
 * Reorder a card inside a stack section, or move it into another stack section (an empty one
 * included). Cards of unknown types may only be reordered where they are. The card keeps its id and
 * content and exists exactly once afterwards; grid sections take no part (their layout is spatial).
 */
export function moveStackWidget(widgetId: string, toSectionId: string, toVisibleIndex: number): Command {
  return (config) => {
    const stacks = config.sections.filter((s) => s.kind === 'stack')
    const lists: Record<string, readonly Widget[]> = Object.fromEntries(stacks.map((s) => [s.id, s.widgets]))
    const fromId = stacks.find((s) => s.widgets.some((w) => w.id === widgetId))?.id
    if (fromId === undefined) return fail(`Widget ${widgetId} is not in a stack section.`)
    if (!Object.hasOwn(lists, toSectionId)) return fail('Cards can only be moved into stack sections.')
    const widget = lists[fromId].find((w) => w.id === widgetId)!
    if (fromId !== toSectionId && !isSchemaKnown(widget.type)) return fail('Unsupported widgets can only be reordered within their own section.')

    const moved = moveAmongVisible(lists, widgetId, toSectionId, toVisibleIndex)
    if (!moved) return fail(`Widget ${widgetId} could not be moved.`)
    if (moved.lists === lists) return ok(config)
    return ok({
      ...config,
      sections: config.sections.map((s) => (Object.hasOwn(moved.lists, s.id) && moved.lists[s.id] !== s.widgets ? { ...s, widgets: [...moved.lists[s.id]] } : s)),
    })
  }
}

/**
 * Reorder the widgets of a grid section semantically (the outline), then repack the visible
 * rectangles deterministically in the new array order, keeping sizes and leaving hidden rectangles
 * alone. Widgets only move inside their own grid section. The array is the semantic order (it is
 * also the order below desktop width), so the narrow layout follows the outline at once. A reorder
 * that changes nothing returns the same config and does not repack.
 */
export function moveGridWidget(widgetId: string, toIndex: number): Command {
  return (config) => {
    const section = config.sections.find((s) => s.kind === 'grid' && s.widgets.some((w) => w.id === widgetId))
    if (!section || !section.layout) return fail(`Widget ${widgetId} is not in a grid section.`)

    const lists = { widgets: section.widgets }
    const moved = moveBetween(lists, widgetId, 'widgets', toIndex)
    if (!moved) return fail(`Widget ${widgetId} could not be moved.`)
    if (moved.lists === lists) return ok(config)

    const widgets = [...moved.lists.widgets]
    const layout = repackLayout(widgets, section.layout)
    return ok({ ...config, sections: config.sections.map((s) => (s.id === section.id ? { ...s, widgets, layout } : s)) })
  }
}

/**
 * Reorder sections from the outline, which lists every section (hidden ones too), so `toIndex` is a position in the
 * whole array. A section moves with all of its widgets, layout and settings: only its place in `sections[]` changes.
 */
export function moveOutlineSection(sectionId: string, toIndex: number): Command {
  return (config) => {
    const lists = { root: config.sections }
    const moved = moveBetween(lists, sectionId, 'root', toIndex)
    if (!moved) return fail(`Section ${sectionId} was not found.`)
    if (moved.lists === lists) return ok(config)
    return ok({ ...config, sections: [...moved.lists.root] })
  }
}

/**
 * Move a widget inside its section or into any other section (grid or stack, an empty one included) from the outline,
 * which lists every widget (hidden ones too), so `toIndex` is a position in the target's whole widget array. The widget
 * keeps its id, content, appearance and hidden state and exists exactly once afterwards. A grid section repacks its
 * visible rectangles in the new array order (as an outline reorder always has); a grid it leaves closes the gap; a
 * widget moving from a stack into a grid starts at its type's default size. Widgets of types this version does not
 * know can be reordered where they are but never leave their section.
 */
export function moveWidgetToSection(widgetId: string, toSectionId: string, toIndex: number): Command {
  return (config) => {
    const from = config.sections.find((s) => s.widgets.some((w) => w.id === widgetId))
    const to = config.sections.find((s) => s.id === toSectionId)
    if (!from) return fail(`Widget ${widgetId} was not found.`)
    if (!to) return fail(`Section ${toSectionId} was not found.`)
    if (!Number.isInteger(toIndex)) return fail('That is not a valid position.')
    const widget = from.widgets.find((w) => w.id === widgetId)!
    if (from.id !== to.id && !isSchemaKnown(widget.type)) return fail('Unsupported widgets can only be reordered within their own section.')

    if (from.id === to.id) {
      const lists = { widgets: from.widgets }
      const moved = moveBetween(lists, widgetId, 'widgets', toIndex)
      if (!moved) return fail(`Widget ${widgetId} could not be moved.`)
      if (moved.lists === lists) return ok(config)
      const widgets = [...moved.lists.widgets]
      const next: Section = { ...from, widgets, ...(from.kind === 'grid' && from.layout && { layout: repackLayout(widgets, from.layout) }) }
      return ok({ ...config, sections: config.sections.map((s) => (s.id === from.id ? next : s)) })
    }

    const leaving: Section = {
      ...from,
      widgets: from.widgets.filter((w) => w.id !== widgetId),
      ...(from.kind === 'grid' && from.layout && { layout: from.layout.filter((r) => r.i !== widgetId) }),
    }
    const index = Math.min(Math.max(toIndex, 0), to.widgets.length)
    const widgets = [...to.widgets.slice(0, index), widget, ...to.widgets.slice(index)]
    let arriving: Section = { ...to, widgets }
    if (to.kind === 'grid') {
      const own: GridRect | undefined = from.layout?.find((r) => r.i === widgetId)
      const size = own ? { w: own.w, h: own.h } : defaultSizeFor(widget.type)
      const rect: GridRect = { i: widgetId, x: 0, y: 0, ...size }
      arriving = { ...arriving, layout: repackLayout(widgets, [...(to.layout ?? []), rect]) }
    }
    return ok({
      ...config,
      sections: config.sections.map((s) => (s.id === from.id ? settleSection(leaving) : s.id === to.id ? arriving : s)),
    })
  }
}

/** Repeatable groups inside a widget that can be reordered: the props key that holds each one's items. */
export type ListKind = 'tasks' | 'gallery' | 'analytics' | 'calendar'
const LIST_KEY: Record<ListKind, string> = { tasks: 'items', gallery: 'items', analytics: 'metrics', calendar: 'events' }
export const listKeyOf = (kind: ListKind): string => LIST_KEY[kind]

/**
 * Only task rows and gallery tiles may move to another widget of their type. Metrics and agenda
 * entries are scoped to their own widget: they can be reordered there and nowhere else.
 */
export const TRANSFERABLE_KINDS: readonly ListKind[] = ['tasks', 'gallery']

/**
 * Reorder an item inside a Tasks, Gallery, Analytics or Calendar widget; for the kinds in
 * TRANSFERABLE_KINDS also move it into another widget of the same type (an empty one included).
 * Items keep their ids and content, so each exists exactly once afterwards; a destination that
 * already holds the maximum number of items refuses the move. Items never cross types: a task id
 * is simply not found among the gallery widgets, so nothing happens.
 */
export function moveListItem(kind: ListKind, itemId: string, toWidgetId: string, toIndex: number): Command {
  return (config) => {
    const widgets = config.sections.flatMap((s) => s.widgets).filter((w) => w.type === kind)
    const key = LIST_KEY[kind]
    const itemsOf = (w: Widget): Array<{ id: string }> => (Array.isArray(w.props[key]) ? (w.props[key] as Array<{ id: string }>) : [])
    const lists: Record<string, readonly { id: string }[]> = Object.fromEntries(widgets.map((w) => [w.id, itemsOf(w)]))

    const fromId = widgets.find((w) => itemsOf(w).some((item) => item.id === itemId))?.id
    if (fromId === undefined) return fail(`Item ${itemId} was not found in any ${kind} widget.`)
    if (!Object.hasOwn(lists, toWidgetId)) return fail(`Items can only be moved into another ${kind} widget.`)
    if (fromId !== toWidgetId && !TRANSFERABLE_KINDS.includes(kind)) return fail(`Entries of a ${kind} widget can only be reordered within their own widget.`)
    if (fromId !== toWidgetId && lists[toWidgetId].length >= MAX_LIST_ITEMS) return fail(`That list already holds ${MAX_LIST_ITEMS} items.`)

    const moved = moveBetween(lists, itemId, toWidgetId, toIndex)
    if (!moved) return fail(`Item ${itemId} could not be moved.`)
    if (moved.lists === lists) return ok(config)
    return ok({
      ...config,
      sections: config.sections.map((s) =>
        s.widgets.some((w) => Object.hasOwn(moved.lists, w.id) && moved.lists[w.id] !== lists[w.id])
          ? {
              ...s,
              widgets: s.widgets.map((w) =>
                Object.hasOwn(moved.lists, w.id) && moved.lists[w.id] !== lists[w.id] ? { ...w, props: { ...w.props, [key]: [...moved.lists[w.id]] } } : w,
              ),
            }
          : s,
      ),
    })
  }
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
