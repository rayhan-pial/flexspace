import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import { moveAmongVisible, moveSection, moveStackWidget } from './reorder'
import type { WorkspaceConfig } from './types'

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Sections',
    navigation: { placement: 'left', primaryItems: [{ id: 'nav-a', label: 'A', targetSectionId: 'grid' }], secondaryItems: [] },
    sections: [
      {
        id: 'grid', kind: 'grid', title: 'Grid',
        widgets: [{ id: 'g1', type: 'notes', props: { body: 'in the grid' } }, { id: 'g2', type: 'welcome' }],
        layout: [{ i: 'g1', x: 0, y: 0, w: 6, h: 4 }, { i: 'g2', x: 6, y: 0, w: 6, h: 3 }],
      },
      {
        id: 'stackA', kind: 'stack', title: 'Stack A',
        widgets: [
          { id: 'a1', type: 'notes', props: { body: 'one' } },
          { id: 'ahid', type: 'notes', hidden: true, props: { body: 'hidden' } },
          { id: 'a2', type: 'tasks', props: { items: [{ id: 't1', text: 'x', done: false }] } },
          { id: 'a3', type: 'kanban', props: { cols: [1, 2] } },
        ],
      },
      { id: 'stackB', kind: 'stack', title: 'Stack B', widgets: [{ id: 'b1', type: 'notes', props: { body: 'bee' } }] },
      { id: 'empty', kind: 'stack', title: 'Empty', widgets: [] },
      { id: 'secret', kind: 'stack', title: 'Secret', hidden: true, widgets: [{ id: 's1', type: 'notes' }] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return deepFreeze(parsed.config)
}

function run(command: Command, from = sample()): WorkspaceConfig {
  const result = command(from)
  if (!result.ok) throw new Error(result.error)
  const parsed = parseWorkspaceConfig(result.config)
  expect(parsed.ok).toBe(true) // duplicate ids or broken geometry would fail here
  if (parsed.ok) expect(parsed.config).toEqual(result.config)
  return result.config
}
const refusal = (command: Command, from = sample()) => {
  const result = command(from)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}
const sectionIds = (c: WorkspaceConfig) => c.sections.map((s) => s.id)
const cards = (c: WorkspaceConfig, id: string) => c.sections.find((s) => s.id === id)!.widgets.map((w) => w.id)
const allWidgetIds = (c: WorkspaceConfig) => c.sections.flatMap((s) => s.widgets.map((w) => w.id)).sort()

describe('moveAmongVisible', () => {
  const lists = deepFreeze({ x: [{ id: '1', hidden: false }, { id: 'h', hidden: true }, { id: '2', hidden: false }, { id: '3', hidden: false }] })
  const ids = (r: ReturnType<typeof moveAmongVisible>) => r!.lists.x.map((i) => i.id)

  it('counts only visible items, leaving hidden ones where they are', () => {
    expect(ids(moveAmongVisible(lists, '3', 'x', 1))).toEqual(['1', 'h', '3', '2']) // before visible #1 ("2"), after "h"
    expect(ids(moveAmongVisible(lists, '1', 'x', 2))).toEqual(['h', '2', '3', '1'])
    expect(ids(moveAmongVisible(lists, '3', 'x', 0))).toEqual(['3', '1', 'h', '2'])
  })
  it('clamps the index, returns the same lists for a no-op and refuses unknown items or lists', () => {
    expect(moveAmongVisible(lists, '2', 'x', 1)!.lists).toBe(lists)
    expect(ids(moveAmongVisible(lists, '1', 'x', 99))).toEqual(['h', '2', '3', '1'])
    expect(moveAmongVisible(lists, 'nope', 'x', 0)).toBeNull()
    expect(moveAmongVisible(lists, '1', 'missing', 0)).toBeNull()
    expect(moveAmongVisible(lists, '1', 'x', 0.5)).toBeNull()
  })
})

describe('moveSection', () => {
  it('reorders sections by visible position and carries everything nested unchanged', () => {
    const before = sample()
    const config = run(moveSection('grid', 2), before) // visible order: grid, stackA, stackB, empty -> after "empty"? index 2 = before stackB's slot
    expect(sectionIds(config)).toEqual(['stackA', 'stackB', 'grid', 'empty', 'secret'])
    const grid = config.sections.find((s) => s.id === 'grid')!
    expect(grid).toBe(before.sections[0]) // the very same object: widgets, layout and props travel with it
    expect(grid.layout).toEqual(before.sections[0].layout)
    expect(config.navigation).toBe(before.navigation) // navigation targets are ids, so they follow automatically
  })
  it('keeps the hidden section where it was', () => {
    expect(sectionIds(run(moveSection('empty', 0)))).toEqual(['empty', 'grid', 'stackA', 'stackB', 'secret'])
    expect(sectionIds(run(moveSection('grid', 99)))).toEqual(['stackA', 'stackB', 'empty', 'grid', 'secret'])
  })
  it('is a no-op for the current position and refuses unknown sections', () => {
    const before = sample()
    const same = moveSection('stackA', 1)(before)
    expect(same.ok && same.config).toBe(before)
    expect(refusal(moveSection('nope', 0))).toMatch(/not found/)
  })
  it('never duplicates or loses a section', () => {
    let config = sample()
    for (const [id, index] of [['grid', 3], ['empty', 0], ['stackB', 2], ['stackA', 0], ['grid', 0]] as const) {
      config = run(moveSection(id, index), config)
      expect([...sectionIds(config)].sort()).toEqual(['empty', 'grid', 'secret', 'stackA', 'stackB'])
    }
  })
})

describe('moveStackWidget', () => {
  it('reorders cards inside a stack section by visible position', () => {
    expect(cards(run(moveStackWidget('a2', 'stackA', 0)), 'stackA')).toEqual(['a2', 'a1', 'ahid', 'a3'])
    expect(cards(run(moveStackWidget('a1', 'stackA', 2)), 'stackA')).toEqual(['ahid', 'a2', 'a3', 'a1'])
  })
  it('transfers a registered card into another stack section, once, with id and content preserved', () => {
    const before = sample()
    const config = run(moveStackWidget('a2', 'stackB', 0), before)
    expect(cards(config, 'stackA')).toEqual(['a1', 'ahid', 'a3'])
    expect(cards(config, 'stackB')).toEqual(['a2', 'b1'])
    expect(config.sections.find((s) => s.id === 'stackB')!.widgets[0]).toBe(before.sections[1].widgets[2]) // same object
    expect(allWidgetIds(config)).toEqual(allWidgetIds(before)) // exactly once
  })
  it('transfers into an empty stack section', () => {
    const config = run(moveStackWidget('b1', 'empty', 0))
    expect(cards(config, 'empty')).toEqual(['b1'])
    expect(cards(config, 'stackB')).toEqual([])
    expect(config.sections.find((s) => s.id === 'empty')!.widgets[0].props).toEqual({ body: 'bee' })
  })
  it('keeps hidden cards in place in both the source and the destination', () => {
    const config = run(moveStackWidget('a1', 'stackB', 1))
    expect(cards(config, 'stackA')).toEqual(['ahid', 'a2', 'a3'])
    expect(cards(config, 'stackB')).toEqual(['b1', 'a1'])
  })
  it('lets an unknown widget be reordered where it is, but never moved to another section', () => {
    expect(cards(run(moveStackWidget('a3', 'stackA', 0)), 'stackA')).toEqual(['a3', 'a1', 'ahid', 'a2'])
    expect(refusal(moveStackWidget('a3', 'stackB', 0))).toMatch(/Unsupported widgets can only be reordered/)
    expect(refusal(moveStackWidget('a3', 'empty', 0))).toMatch(/Unsupported widgets can only be reordered/)
  })
  it('never involves grid sections: cards cannot enter or leave them', () => {
    expect(refusal(moveStackWidget('a1', 'grid', 0))).toMatch(/only be moved into stack sections/)
    expect(refusal(moveStackWidget('g1', 'stackA', 0))).toMatch(/not in a stack section/)
  })
  it('a card cannot become a section, and unknown ids or sections are refused', () => {
    expect(refusal(moveStackWidget('a1', 'nav-a', 0))).toMatch(/only be moved into stack sections/)
    expect(refusal(moveStackWidget('stackA', 'stackB', 0))).toMatch(/not in a stack section/) // a section id is not a card
    expect(refusal(moveStackWidget('nope', 'stackB', 0))).toMatch(/not in a stack section/)
    expect(refusal(moveStackWidget('a1', 'missing', 0))).toMatch(/only be moved into stack sections/)
    expect(refusal(moveStackWidget('a1', 'constructor', 0))).toMatch(/only be moved into stack sections/)
  })
  it('is a no-op (same config) when nothing would change and shares untouched sections', () => {
    const before = sample()
    const same = moveStackWidget('a1', 'stackA', 0)(before)
    expect(same.ok && same.config).toBe(before)
    const moved = run(moveStackWidget('b1', 'empty', 0), before)
    expect(moved.sections[0]).toBe(before.sections[0]) // the grid section is untouched
    expect(moved.sections[1]).toBe(before.sections[1])
  })
  it('keeps every card exactly once across any sequence of moves', () => {
    let config = sample()
    const expected = allWidgetIds(config)
    const moves: Array<[string, string, number]> = [
      ['a1', 'empty', 0], ['b1', 'empty', 0], ['a2', 'stackB', 5], ['a1', 'stackA', 0], ['b1', 'stackA', 1], ['a3', 'stackA', 3], ['a2', 'empty', 0],
    ]
    for (const [id, to, index] of moves) {
      config = run(moveStackWidget(id, to, index), config)
      expect(allWidgetIds(config)).toEqual(expected)
    }
  })
})
