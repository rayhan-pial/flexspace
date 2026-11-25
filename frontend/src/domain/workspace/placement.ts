import { DEFAULT_MIN_SIZE, GRID_COLUMNS, MIN_SIZE } from './constants'
import type { GridRect } from './types'

/** Smallest valid size for a widget type. Own keys only: a type named "constructor" is just unknown. */
export function minSizeFor(type: string): readonly [w: number, h: number] {
  return Object.hasOwn(MIN_SIZE, type) ? MIN_SIZE[type] : DEFAULT_MIN_SIZE
}

/** Roomier starting sizes for widgets that show lists of content (never below the type minimum). */
const PREFERRED_SIZE: Record<string, readonly [w: number, h: number]> = { gallery: [6, 6], analytics: [6, 5], tasks: [4, 6], calendar: [6, 8] }

/** Size a newly added widget starts with: comfortable, but never below its minimum. */
export function defaultSizeFor(type: string): { w: number; h: number } {
  const [minW, minH] = minSizeFor(type)
  const [prefW, prefH] = Object.hasOwn(PREFERRED_SIZE, type) ? PREFERRED_SIZE[type] : [4, 4]
  return { w: Math.min(GRID_COLUMNS, Math.max(minW, prefW)), h: Math.max(minH, prefH) }
}

export function overlaps(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * First free position, scanning rows top to bottom then columns left to right, for a `w` x `h`
 * rectangle that does not overlap any of `occupied`. Deterministic and always terminates: below
 * the lowest occupied row everything is free.
 */
export function findFreePosition(occupied: readonly GridRect[], w: number, h: number): { x: number; y: number } {
  const bottom = occupied.reduce((max, rect) => Math.max(max, rect.y + rect.h), 0)
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + w <= GRID_COLUMNS; x += 1) {
      const candidate: GridRect = { i: '', x, y, w, h }
      if (!occupied.some((rect) => overlaps(rect, candidate))) return { x, y }
    }
  }
  return { x: 0, y: bottom }
}

/**
 * Vertical compaction of a complete set of rectangles: each one, in (y, x, id) order, moves up to
 * the first row where it overlaps nothing already placed. Sizes and columns never change, the
 * result never overlaps (given a non-overlapping input), and running it twice changes nothing.
 */
export function compactLayout(rects: readonly GridRect[]): GridRect[] {
  const ordered = [...rects].sort((a, b) => a.y - b.y || a.x - b.x || (a.i < b.i ? -1 : a.i > b.i ? 1 : 0))
  const placed: GridRect[] = []
  for (const rect of ordered) {
    let y = 0
    while (placed.some((other) => overlaps(other, { ...rect, y }))) y += 1
    placed.push({ ...rect, y })
  }
  return placed
}

/**
 * Collision resolution around one fixed rectangle: `pinnedId` stays exactly where it is, and every
 * other rectangle, taken in (y, x, id) order, keeps its column and size but moves *down* just far
 * enough to clear everything already placed. Never moves anything up or sideways, never changes a size,
 * and the result has no overlaps (given in-bounds input). Pure: the input is not modified.
 */
export function pushDown(rects: readonly GridRect[], pinnedId: string): GridRect[] {
  const pinned = rects.find((r) => r.i === pinnedId)
  const others = rects
    .filter((r) => r.i !== pinnedId)
    .map((r) => ({ ...r }))
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.i < b.i ? -1 : a.i > b.i ? 1 : 0))
  const placed: GridRect[] = pinned ? [{ ...pinned }] : []
  for (const rect of others) {
    while (placed.some((other) => overlaps(other, rect))) rect.y += 1
    placed.push(rect)
  }
  const byId = new Map(placed.map((r) => [r.i, r]))
  return rects.map((r) => byId.get(r.i)!)
}

/**
 * The layout a drag or resize ends in: neighbours are pushed down out of the moved widget's way
 * (`pushDown`), then everything is compacted upward. This is the single resolution used both for the
 * live preview and for the committed result, so what is shown while dragging is what is saved.
 */
export function reflowAfterGesture(rects: readonly GridRect[], movedId: string): GridRect[] {
  const compact = new Map(compactLayout(pushDown(rects, movedId)).map((r) => [r.i, r]))
  return rects.map((r) => compact.get(r.i)!)
}

/** Widget ids in semantic order: the ids of `visible` rectangles sorted by (y, x, id). */
export function spatialOrder(rects: readonly GridRect[]): string[] {
  return [...rects].sort((a, b) => a.y - b.y || a.x - b.x || (a.i < b.i ? -1 : a.i > b.i ? 1 : 0)).map((r) => r.i)
}

/**
 * Deterministic repacking after a semantic reorder: visible widgets are taken in array order and
 * each keeps its size but is placed at the first free row-major position (rows top to bottom,
 * columns left to right) given those already placed. Hidden widgets reserve no space and keep their
 * rectangles untouched; the result keeps the layout's own order and one rectangle per widget.
 */
export function repackLayout(widgets: ReadonlyArray<{ id: string; hidden: boolean }>, layout: readonly GridRect[]): GridRect[] {
  const byId = new Map(layout.map((rect) => [rect.i, rect]))
  const placed: GridRect[] = []
  const next = new Map<string, GridRect>()
  for (const widget of widgets) {
    const rect = byId.get(widget.id)
    if (widget.hidden || !rect) continue
    const repacked = { ...rect, ...findFreePosition(placed, rect.w, rect.h) }
    placed.push(repacked)
    next.set(widget.id, repacked)
  }
  return layout.map((rect) => next.get(rect.i) ?? rect)
}
