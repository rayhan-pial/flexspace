import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { overlaps } from './placement'
import { removeWidget, setWidgetHidden } from './lifecycle'
import { deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import type { GridRect, WorkspaceConfig } from './types'

/* Hiding or removing a widget closes the space it leaves; hidden rectangles and other sections are left alone. */

// Three rows: a (top), b (middle), c (bottom), all full width, plus a hidden rectangle and a stack section.
function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Gap',
    sections: [
      {
        id: 'g', kind: 'grid', title: 'Grid',
        widgets: [
          { id: 'a', type: 'notes' }, { id: 'b', type: 'notes' }, { id: 'hid', type: 'notes', hidden: true }, { id: 'c', type: 'notes' },
        ],
        layout: [
          { i: 'a', x: 0, y: 0, w: 12, h: 4 }, { i: 'b', x: 0, y: 4, w: 12, h: 4 },
          { i: 'hid', x: 0, y: 20, w: 6, h: 4 }, { i: 'c', x: 0, y: 8, w: 12, h: 4 },
        ],
      },
      { id: 's', kind: 'stack', title: 'Stack', widgets: [{ id: 'x', type: 'notes' }, { id: 'y', type: 'notes' }] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return deepFreeze(parsed.config)
}
function run(command: Command, from = sample()): WorkspaceConfig {
  const result = command(from)
  if (!result.ok) throw new Error(result.error)
  const parsed = parseWorkspaceConfig(result.config)
  expect(parsed.ok).toBe(true)
  if (parsed.ok) expect(parsed.config).toEqual(result.config)
  return result.config
}
const rects = (config: WorkspaceConfig) => Object.fromEntries(config.sections[0].layout!.map((r) => [r.i, r]))
const order = (config: WorkspaceConfig) => config.sections[0].widgets.map((w) => w.id)
const visibleOverlap = (config: WorkspaceConfig) => {
  const hidden = new Set(config.sections[0].widgets.filter((w) => w.hidden).map((w) => w.id))
  const visible = config.sections[0].layout!.filter((r: GridRect) => !hidden.has(r.i))
  return visible.some((p, n) => visible.slice(n + 1).some((q) => overlaps(p, q)))
}

describe('hiding a widget closes its gap', () => {
  it('moves the cards below up into the freed space', () => {
    const config = run(setWidgetHidden('b', true))
    expect(rects(config).a).toMatchObject({ y: 0 })
    expect(rects(config).c).toMatchObject({ y: 4 }) // was 8
    expect(visibleOverlap(config)).toBe(false)
  })

  it('keeps the hidden widget own rectangle exactly, and sizes and columns of the others', () => {
    const before = rects(sample())
    const after = rects(run(setWidgetHidden('b', true)))
    expect(after.b).toEqual(before.b)
    expect(after.hid).toEqual(before.hid)
    for (const id of ['a', 'c']) expect([after[id].x, after[id].w, after[id].h]).toEqual([before[id].x, before[id].w, before[id].h])
  })

  it('leaves other sections alone, shares their object, and keeps array order matching the visible layout', () => {
    const before = sample()
    const config = run(setWidgetHidden('a', true), before)
    expect(config.sections[1]).toBe(before.sections[1])
    expect(order(config).filter((id) => id !== 'hid' && id !== 'a')).toEqual(['b', 'c'])
  })

  it('showing it again finds a free spot, never overlapping, and the cards stay put', () => {
    const hidden = run(setWidgetHidden('b', true))
    const shown = run(setWidgetHidden('b', false), hidden)
    expect(visibleOverlap(shown)).toBe(false)
    expect(shown.sections[0].widgets.find((w) => w.id === 'b')!.hidden).toBe(false)
  })

  it('hiding the bottom widget changes nothing else', () => {
    const config = run(setWidgetHidden('c', true))
    expect(rects(config).a).toEqual(rects(sample()).a)
    expect(rects(config).b).toEqual(rects(sample()).b)
  })

  it('does nothing to a stack section', () => {
    const before = sample()
    const config = run(setWidgetHidden('x', true), before)
    expect(config.sections[0]).toBe(before.sections[0])
    expect(config.sections[1].widgets.map((w) => [w.id, w.hidden])).toEqual([['x', true], ['y', false]])
  })
})

describe('removing a widget closes its gap', () => {
  it('moves the cards below up and drops only the removed rectangle', () => {
    const config = run(removeWidget('b'))
    expect(rects(config).b).toBeUndefined()
    expect(rects(config).c).toMatchObject({ y: 4 })
    expect(rects(config).hid).toEqual(rects(sample()).hid)
    expect(visibleOverlap(config)).toBe(false)
  })
})
