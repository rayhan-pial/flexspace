import { DEFAULT_MIN_SIZE, GRID_COLUMNS, MIN_SIZE } from './constants'
import type { GridRect } from './types'

/** Smallest valid size for a widget type. Own keys only: a type named "constructor" is just unknown. */
export function minSizeFor(type: string): readonly [w: number, h: number] {
  return Object.hasOwn(MIN_SIZE, type) ? MIN_SIZE[type] : DEFAULT_MIN_SIZE
}

/** Size a newly added widget starts with: comfortable, but never below its minimum. */
export function defaultSizeFor(type: string): { w: number; h: number } {
  const [minW, minH] = minSizeFor(type)
  return { w: Math.min(GRID_COLUMNS, Math.max(minW, 4)), h: Math.max(minH, 4) }
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
