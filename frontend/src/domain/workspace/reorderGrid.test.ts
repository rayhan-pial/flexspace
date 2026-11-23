import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { commitGridLayout } from './grid'
import { deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import { overlaps, repackLayout } from './placement'
import { moveGridWidget } from './reorder'
import type { GridRect, WorkspaceConfig } from './types'

const rect = (i: string, x: number, y: number, w: number, h: number): GridRect => ({ i, x, y, w, h })

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Grid',
    sections: [
      {
        id: 'grid', kind: 'grid', title: 'Dashboard',
        // Array order: welcome, hid, notes, tasks, cal. `hid` is hidden and overlaps `welcome`.
        widgets: [
          { id: 'welcome', type: 'welcome' }, { id: 'hid', type: 'notes', hidden: true }, { id: 'notes', type: 'notes' },
          { id: 'tasks', type: 'tasks' }, { id: 'cal', type: 'calendar' },
        ],
        layout: [rect('welcome', 0, 0, 12, 3), rect('hid', 0, 0, 4, 3), rect('notes', 0, 3, 6, 4), rect('tasks', 6, 3, 6, 4), rect('cal', 0, 7, 12, 6)],
      },
      { id: 'stack', kind: 'stack', title: 'Stack', widgets: [{ id: 'st1', type: 'notes' }] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return deepFreeze(parsed.config)
}

function run(command: Command, from = sample()): WorkspaceConfig {
  const result = command(from)
  if (!result.ok) throw new Error(result.error)
  const parsed = parseWorkspaceConfig(result.config)
  expect(parsed.ok).toBe(true) // sizes, bounds, one rectangle per widget, no visible overlap
  if (parsed.ok) expect(parsed.config).toEqual(result.config)
  return result.config
}
const refusal = (command: Command, from = sample()) => {
  const result = command(from)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}
const grid = (c: WorkspaceConfig) => c.sections[0]
const order = (c: WorkspaceConfig) => grid(c).widgets.map((w) => w.id)
const at = (c: WorkspaceConfig, id: string) => grid(c).layout!.find((r) => r.i === id)!
const visibleSpatialOrder = (c: WorkspaceConfig) =>
  grid(c).widgets.filter((w) => !w.hidden).map((w) => at(c, w.id)).sort((a, b) => a.y - b.y || a.x - b.x).map((r) => r.i)
const visibleArrayOrder = (c: WorkspaceConfig) => grid(c).widgets.filter((w) => !w.hidden).map((w) => w.id)

describe('repackLayout', () => {
  it('places visible widgets in array order at the first free row-major position, keeping their sizes', () => {
    const widgets = [{ id: 'a', hidden: false }, { id: 'b', hidden: false }, { id: 'c', hidden: false }]
    const layout = [rect('a', 5, 9, 6, 4), rect('b', 0, 20, 6, 4), rect('c', 3, 30, 12 - 0, 2)]
    const repacked = repackLayout(widgets, layout)
    expect(repacked).toEqual([rect('a', 0, 0, 6, 4), rect('b', 6, 0, 6, 4), rect('c', 0, 4, 12, 2)])
  })
  it('hidden widgets reserve no space and keep their rectangles exactly', () => {
    const widgets = [{ id: 'a', hidden: false }, { id: 'h', hidden: true }, { id: 'b', hidden: false }]
    const layout = [rect('a', 3, 3, 6, 4), rect('h', 1, 1, 6, 4), rect('b', 7, 7, 6, 4)]
    const repacked = repackLayout(widgets, layout)
    expect(repacked[1]).toBe(layout[1]) // the very same object
    expect(repacked[0]).toEqual(rect('a', 0, 0, 6, 4))
    expect(repacked[2]).toEqual(rect('b', 6, 0, 6, 4)) // would not have fit beside `h` if `h` reserved space
  })
  it('is deterministic, idempotent, order-preserving in the layout, and never overlaps (random layouts)', () => {
    let seed = 11
    const next = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n)
    for (let round = 0; round < 50; round += 1) {
      const widgets = Array.from({ length: 8 }, (_, n) => ({ id: `w${n}`, hidden: next(5) === 0 }))
      const layout = widgets.map((w) => rect(w.id, 0, next(40), 1 + next(12), 2 + next(5)))
      const once = repackLayout(widgets, layout)
      expect(repackLayout(widgets, layout)).toEqual(once) // deterministic
      expect(repackLayout(widgets, once)).toEqual(once) // idempotent
      expect(once.map((r) => r.i)).toEqual(layout.map((r) => r.i)) // same order and ids
      const visible = once.filter((r) => !widgets.find((w) => w.id === r.i)!.hidden)
      expect(visible.some((a, n) => visible.slice(n + 1).some((b) => overlaps(a, b)))).toBe(false)
      for (const r of visible) expect(r.x + r.w).toBeLessThanOrEqual(12)
      once.forEach((r, n) => expect([r.w, r.h]).toEqual([layout[n].w, layout[n].h])) // sizes never change
    }
  })
})

describe('moveGridWidget (outline reorder)', () => {
  it('reorders the array and repacks the visible rectangles in the new order', () => {
    const config = run(moveGridWidget('cal', 0))
    expect(order(config)).toEqual(['cal', 'welcome', 'hid', 'notes', 'tasks'])
    expect(at(config, 'cal')).toEqual(rect('cal', 0, 0, 12, 6))
    expect(at(config, 'welcome')).toEqual(rect('welcome', 0, 6, 12, 3))
    expect(at(config, 'notes')).toEqual(rect('notes', 0, 9, 6, 4))
    expect(at(config, 'tasks')).toEqual(rect('tasks', 6, 9, 6, 4))
  })
  it('the narrow-screen order is the array order, so it follows the outline at once', () => {
    const config = run(moveGridWidget('tasks', 0))
    expect(visibleArrayOrder(config)).toEqual(['tasks', 'welcome', 'notes', 'cal'])
  })
  it('hidden widgets stay valid: their rectangle is untouched and they may overlap a visible one', () => {
    const before = sample()
    const config = run(moveGridWidget('notes', 4), before)
    expect(at(config, 'hid')).toBe(before.sections[0].layout!.find((r) => r.i === 'hid')) // same object
    expect(order(config)).toEqual(['welcome', 'hid', 'tasks', 'cal', 'notes'])
    expect(grid(config).widgets.find((w) => w.id === 'hid')!.hidden).toBe(true)
  })
  it('a hidden widget can itself be reordered without disturbing any rectangle', () => {
    const before = sample()
    const config = run(moveGridWidget('hid', 4), before)
    expect(order(config)).toEqual(['welcome', 'notes', 'tasks', 'cal', 'hid'])
    expect(grid(config).layout).toEqual(repackLayout(grid(config).widgets, before.sections[0].layout!)) // visible order unchanged
    expect(visibleArrayOrder(config)).toEqual(visibleArrayOrder(before))
  })
  it('clamps the index, is a no-op for the current place and shares other sections', () => {
    const before = sample()
    const same = moveGridWidget('notes', 2)(before)
    expect(same.ok && same.config).toBe(before)
    expect(order(run(moveGridWidget('welcome', 99))).at(-1)).toBe('welcome')
    const moved = run(moveGridWidget('cal', 0), before)
    expect(moved.sections[1]).toBe(before.sections[1])
  })
  it('only reorders inside a grid section: stack widgets and unknown ids are refused', () => {
    expect(refusal(moveGridWidget('st1', 0))).toMatch(/not in a grid section/)
    expect(refusal(moveGridWidget('nope', 0))).toMatch(/not in a grid section/)
    expect(refusal(moveGridWidget('welcome', 1.5))).toMatch(/could not be moved/)
  })
})

describe('the two directions stay in step', () => {
  it('a spatial move re-sorts the visible array order; an outline reorder re-packs the positions', () => {
    // Spatial: drag `cal` to the top-left corner; the commit compacts and syncs the array order.
    const dragged = run(
      commitGridLayout('grid', [rect('welcome', 0, 6, 12, 3), rect('notes', 0, 9, 6, 4), rect('tasks', 6, 9, 6, 4), rect('cal', 0, 0, 12, 6)]),
    )
    expect(visibleArrayOrder(dragged)).toEqual(visibleSpatialOrder(dragged)) // semantic order follows position
    expect(visibleArrayOrder(dragged)[0]).toBe('cal')
    // Semantic: reorder in the outline; the positions follow.
    const reordered = run(moveGridWidget('notes', 0), dragged)
    expect(visibleArrayOrder(reordered)[0]).toBe('notes')
    expect(at(reordered, 'notes')).toMatchObject({ x: 0, y: 0 })
  })
  it('known property: a small widget may be packed into an earlier gap, so spatial and array order can differ until the next move', () => {
    const parsed = parseWorkspaceConfig({
      schemaVersion: 1, title: 'Gap',
      sections: [{ id: 'g', kind: 'grid', title: 'G',
        widgets: [{ id: 'one', type: 'notes' }, { id: 'wide', type: 'welcome' }, { id: 'small', type: 'notes' }],
        layout: [rect('one', 0, 0, 6, 4), rect('wide', 0, 4, 12, 3), rect('small', 0, 8, 3, 3)] }],
    })
    if (!parsed.ok) throw new Error(parsed.message)
    const config = run(moveGridWidget('small', 2), deepFreeze(parsed.config)) // order unchanged: no-op
    expect(config).toEqual(parsed.config)
    const moved = run(moveGridWidget('one', 0), deepFreeze(parsed.config)) // also a no-op
    expect(moved).toEqual(parsed.config)
    const reordered = run(moveGridWidget('wide', 2), deepFreeze(parsed.config)) // one, small, wide
    expect(grid(reordered).widgets.map((w) => w.id)).toEqual(['one', 'small', 'wide'])
    const placed = grid(reordered).layout!
    expect(placed.find((r) => r.i === 'small')).toMatchObject({ x: 6, y: 0 }) // beside `one`, in the gap
    expect(placed.find((r) => r.i === 'wide')).toMatchObject({ x: 0, y: 4 })
  })
})
