import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { commitGridLayout, nudgeWidget } from './grid'
import { deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import { compactLayout, overlaps, spatialOrder } from './placement'
import type { GridRect, WorkspaceConfig } from './types'

// Array order: a, hid, b, c. Visible rectangles: a (0,0 6x4), b (6,0 6x4), c (0,4 6x4). `hid` is hidden at (0,0).
function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Grid',
    sections: [
      {
        id: 's1', kind: 'grid', title: 'Main',
        widgets: [
          { id: 'a', type: 'notes' }, { id: 'hid', type: 'notes', hidden: true }, { id: 'b', type: 'notes' }, { id: 'c', type: 'welcome' },
        ],
        layout: [
          { i: 'a', x: 0, y: 0, w: 6, h: 4 }, { i: 'hid', x: 0, y: 0, w: 4, h: 3 }, { i: 'b', x: 6, y: 0, w: 6, h: 4 }, { i: 'c', x: 0, y: 4, w: 6, h: 3 },
        ],
      },
      { id: 's2', kind: 'stack', title: 'Stack', widgets: [{ id: 'st', type: 'notes' }] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return deepFreeze(parsed.config)
}

function run(command: Command, from = sample()): WorkspaceConfig {
  const result = command(from)
  if (!result.ok) throw new Error(result.error)
  const parsed = parseWorkspaceConfig(result.config)
  expect(parsed.ok).toBe(true) // what the store would require
  if (parsed.ok) expect(parsed.config).toEqual(result.config)
  return result.config
}
const refusal = (command: Command, from = sample()) => {
  const result = command(from)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}
const rect = (i: string, x: number, y: number, w: number, h: number): GridRect => ({ i, x, y, w, h })
const layoutOf = (config: WorkspaceConfig) => config.sections[0].layout!
const orderOf = (config: WorkspaceConfig) => config.sections[0].widgets.map((w) => w.id)

describe('compactLayout', () => {
  it('moves items up without changing columns or sizes, and is idempotent', () => {
    const result = compactLayout([rect('a', 0, 5, 6, 4), rect('b', 6, 9, 6, 4), rect('c', 0, 12, 6, 3)])
    expect(result).toEqual([rect('a', 0, 0, 6, 4), rect('b', 6, 0, 6, 4), rect('c', 0, 4, 6, 3)])
    expect(compactLayout(result)).toEqual(result)
  })
  it('is deterministic whatever the input order, and keeps stacked items stacked', () => {
    const input = [rect('c', 0, 8, 4, 2), rect('a', 0, 0, 4, 2), rect('b', 0, 4, 4, 2)]
    expect(compactLayout(input)).toEqual(compactLayout([...input].reverse()))
    expect(compactLayout(input).map((r) => [r.i, r.y])).toEqual([['a', 0], ['b', 2], ['c', 4]])
  })
  it('never produces overlaps, for many pseudo-random non-overlapping inputs', () => {
    let seed = 7
    const next = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n)
    for (let round = 0; round < 60; round += 1) {
      const placed: GridRect[] = []
      for (let n = 0; n < 8; n += 1) {
        const w = 1 + next(6)
        const candidate = rect(`r${n}`, next(13 - w), next(30), w, 2 + next(4))
        if (!placed.some((other) => overlaps(other, candidate))) placed.push(candidate)
      }
      const out = compactLayout(placed)
      expect(out.some((a, n) => out.slice(n + 1).some((b) => overlaps(a, b)))).toBe(false)
      const byId = (rects: GridRect[]) => [...rects].sort((p, q) => (p.i < q.i ? -1 : 1))
      expect(byId(compactLayout(out))).toEqual(byId(out))
      expect(out.every((r, n) => r.x === placed.find((p) => p.i === r.i)!.x && r.y <= placed.find((p) => p.i === r.i)!.y && n >= 0)).toBe(true)
    }
  })
  it('orders ids by row, then column, then id', () => {
    expect(spatialOrder([rect('z', 0, 0, 1, 1), rect('y', 6, 0, 1, 1), rect('x', 0, 4, 1, 1), rect('w', 0, 0, 1, 1)])).toEqual(['w', 'z', 'y', 'x'])
  })
})

describe('commitGridLayout', () => {
  it('compacts the visible result once, retains hidden rectangles and syncs visible array order', () => {
    // b dragged far down-left, below c; a dragged to the right of the old b slot.
    const config = run(commitGridLayout('s1', [rect('a', 6, 0, 6, 4), rect('b', 0, 10, 6, 4), rect('c', 0, 4, 6, 3)]))
    expect(layoutOf(config)).toEqual([rect('a', 6, 0, 6, 4), rect('hid', 0, 0, 4, 3), rect('b', 0, 3, 6, 4), rect('c', 0, 0, 6, 3)])
    // Visible ids by (y, x, id) are c, a, b, inserted into the visible slots; `hid` keeps its slot (index 1).
    expect(orderOf(config)).toEqual(['c', 'hid', 'a', 'b'])
  })
  it('returns an equal layout when a gesture ends where it began', () => {
    const before = sample()
    const after = run(commitGridLayout('s1', before.sections[0].layout!.filter((r) => r.i !== 'hid')))
    expect(after).toEqual(before)
  })
  it('keeps hidden rectangles byte-for-byte even if they now overlap a visible widget', () => {
    const config = run(commitGridLayout('s1', [rect('a', 0, 0, 6, 4), rect('b', 6, 0, 6, 4), rect('c', 0, 4, 6, 3)]))
    expect(layoutOf(config).find((r) => r.i === 'hid')).toEqual(rect('hid', 0, 0, 4, 3))
  })
  it('refuses overlaps, out-of-bounds, undersized, fractional and mismatched layouts', () => {
    const base = [rect('a', 0, 0, 6, 4), rect('b', 6, 0, 6, 4), rect('c', 0, 4, 6, 3)]
    const swap = (i: string, change: Partial<GridRect>) => base.map((r) => (r.i === i ? { ...r, ...change } : r))
    expect(refusal(commitGridLayout('s1', swap('b', { x: 3 })))).toMatch(/overlap/)
    expect(refusal(commitGridLayout('s1', swap('b', { x: 8 })))).toMatch(/outside/)
    expect(refusal(commitGridLayout('s1', swap('b', { x: -1 })))).toMatch(/outside/)
    expect(refusal(commitGridLayout('s1', swap('c', { h: 1 })))).toMatch(/smaller/) // welcome minimum is 3x2
    expect(refusal(commitGridLayout('s1', swap('c', { w: 2 })))).toMatch(/smaller/)
    expect(refusal(commitGridLayout('s1', swap('a', { y: 0.5 })))).toMatch(/whole/)
    expect(refusal(commitGridLayout('s1', swap('a', { h: 25 })))).toMatch(/taller/)
    expect(refusal(commitGridLayout('s1', base.slice(1)))).toMatch(/does not match/)
    expect(refusal(commitGridLayout('s1', [...base, rect('hid', 0, 9, 4, 3)]))).toMatch(/does not match/) // hidden is not part of a gesture
    expect(refusal(commitGridLayout('s1', [...base.slice(0, 2), rect('a', 0, 9, 6, 4)]))).toMatch(/does not match/)
    expect(refusal(commitGridLayout('s1', [...base.slice(0, 2), rect('ghost', 0, 4, 6, 3)]))).toMatch(/does not match/)
  })
  it('only works on grid sections', () => {
    expect(refusal(commitGridLayout('s2', []))).toMatch(/not found/)
    expect(refusal(commitGridLayout('nope', []))).toMatch(/not found/)
  })
  it('does not mutate its input and leaves other sections shared', () => {
    const before = sample()
    const after = run(commitGridLayout('s1', [rect('a', 6, 0, 6, 4), rect('b', 0, 10, 6, 4), rect('c', 0, 4, 6, 3)]), before)
    expect(after.sections[1]).toBe(before.sections[1])
  })
})

describe('nudgeWidget', () => {
  it('moves by whole cells and keeps array order in step with position', () => {
    const config = run(nudgeWidget('c', { dx: 6 })) // c to the right of its row: (6,4)
    expect(layoutOf(config).find((r) => r.i === 'c')).toEqual(rect('c', 6, 4, 6, 3))
    const swapped = run(nudgeWidget('a', { dy: 0 }), config)
    expect(orderOf(swapped)).toEqual(['a', 'hid', 'b', 'c'])
    const down = run(nudgeWidget('b', { dy: 1 })) // b below... still above c's row start? b occupies y 1-5, c at y 4 x 0-6: no overlap (b is x 6-12)
    expect(layoutOf(down).find((r) => r.i === 'b')!.y).toBe(1)
  })
  it('resizes by whole cells within the minimum and the grid', () => {
    expect(layoutOf(run(nudgeWidget('c', { dw: 1, dh: 1 }))).find((r) => r.i === 'c')).toEqual(rect('c', 0, 4, 7, 4))
    expect(refusal(nudgeWidget('c', { dw: -4 }))).toMatch(/smaller/)
    expect(refusal(nudgeWidget('b', { dw: 1 }))).toMatch(/outside/)
  })
  it('refuses to land on another visible widget, but a hidden widget does not block', () => {
    expect(refusal(nudgeWidget('a', { dx: 1 }))).toMatch(/taken/)
    expect(refusal(nudgeWidget('a', { dx: -1 }))).toMatch(/outside/)
    expect(refusal(nudgeWidget('a', { dy: -1 }))).toMatch(/outside/)
    const moved = run(nudgeWidget('c', { dy: -0 }))
    expect(moved).toEqual(sample())
    // a hidden widget can be moved anywhere valid, even over visible ones
    expect(layoutOf(run(nudgeWidget('hid', { dx: 1 }))).find((r) => r.i === 'hid')!.x).toBe(1)
  })
  it('fails for stack widgets and unknown ids', () => {
    expect(refusal(nudgeWidget('st', { dx: 1 }))).toMatch(/not in a grid/)
    expect(refusal(nudgeWidget('nope', { dx: 1 }))).toMatch(/not in a grid/)
  })
})
