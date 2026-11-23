import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { KNOWN_WIDGET_TYPES, MAX_SECTIONS, MAX_WIDGETS } from './constants'
import { DEFAULT_WIDGET_PROPS } from './defaults'
import { deepFreeze } from './immutable'
import {
  addSection, addWidget, collectIds, removeSection, removeWidget, setSectionHidden, setSectionTitle, setWidgetHidden,
} from './lifecycle'
import { parseKnownProps, parseWorkspaceConfig } from './parse'
import { defaultSizeFor, findFreePosition, minSizeFor } from './placement'
import type { WorkspaceConfig } from './types'

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Sample',
    navigation: {
      placement: 'left',
      primaryItems: [{ id: 'nav-a', label: 'Main', targetSectionId: 's1' }, { id: 'nav-b', label: 'Other', targetSectionId: 's2' }],
      secondaryItems: [{ id: 'nav-c', label: 'Again', targetSectionId: 's1' }],
    },
    sections: [
      {
        id: 's1', kind: 'grid', title: 'Main',
        widgets: [
          { id: 'w1', type: 'notes', props: { body: 'a' } },
          { id: 'w2', type: 'welcome', props: { greeting: 'Hi' } },
          { id: 'w3', type: 'tasks', hidden: true, props: { items: [{ id: 't1', text: 'x', done: false }] } },
        ],
        layout: [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }, { i: 'w2', x: 6, y: 0, w: 6, h: 3 }, { i: 'w3', x: 0, y: 0, w: 4, h: 4 }],
      },
      { id: 's2', kind: 'stack', title: 'Other', widgets: [{ id: 'w4', type: 'notes' }] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return deepFreeze(parsed.config)
}

/** Run a command and assert the result is a valid, canonical document (what the store requires). */
function run(command: Command, from = sample()): WorkspaceConfig {
  const result = command(from)
  if (!result.ok) throw new Error(result.error)
  const parsed = parseWorkspaceConfig(result.config)
  expect(parsed.ok).toBe(true)
  if (parsed.ok) expect(parsed.config).toEqual(result.config)
  return result.config
}
const fails = (command: Command, from = sample()) => {
  const result = command(from)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}

describe('placement', () => {
  it('finds the first free position deterministically', () => {
    const rect = (x: number, y: number, w: number, h: number) => ({ i: 'r', x, y, w, h })
    expect(findFreePosition([], 4, 4)).toEqual({ x: 0, y: 0 })
    expect(findFreePosition([rect(0, 0, 4, 4)], 4, 4)).toEqual({ x: 4, y: 0 })
    expect(findFreePosition([rect(0, 0, 6, 4), rect(6, 0, 6, 4)], 4, 4)).toEqual({ x: 0, y: 4 })
    expect(findFreePosition([rect(0, 0, 12, 2)], 12, 2)).toEqual({ x: 0, y: 2 })
    // A gap left by the layout is used before extending downwards.
    expect(findFreePosition([rect(0, 0, 4, 4), rect(8, 0, 4, 4), rect(0, 4, 12, 2)], 4, 4)).toEqual({ x: 4, y: 0 })
  })
  it('never returns a size below the minimum and treats prototype names as unknown', () => {
    for (const type of KNOWN_WIDGET_TYPES) {
      const [minW, minH] = minSizeFor(type)
      const { w, h } = defaultSizeFor(type)
      expect(w).toBeGreaterThanOrEqual(minW)
      expect(h).toBeGreaterThanOrEqual(minH)
    }
    expect(minSizeFor('constructor')).toEqual([1, 2])
  })
})

describe('defaults', () => {
  it('every known widget type has props that its own parser accepts unchanged', () => {
    for (const type of KNOWN_WIDGET_TYPES) {
      const parsed = parseKnownProps(type, DEFAULT_WIDGET_PROPS[type])
      expect(parsed).toEqual({ ok: true, props: DEFAULT_WIDGET_PROPS[type] })
    }
  })
})

describe('addWidget', () => {
  it('adds every known type with defaults to a grid section at a free, valid position', () => {
    let config = sample()
    for (const type of KNOWN_WIDGET_TYPES) config = run(addWidget('s1', type, `new-${type}`), config)
    const s1 = config.sections[0]
    expect(s1.widgets.map((w) => w.id).slice(-6)).toEqual(KNOWN_WIDGET_TYPES.map((t) => `new-${t}`))
    expect(s1.widgets.at(-1)).toMatchObject({ type: 'calendar', hidden: false, title: '', props: DEFAULT_WIDGET_PROPS.calendar })
    expect(s1.layout).toHaveLength(s1.widgets.length) // geometry for each one; parse enforces no overlap
  })
  it('treats only visible widgets as occupying space, so a hidden widget can be shown elsewhere later', () => {
    const hiddenOnly = run(setWidgetHidden('w2', true), run(setWidgetHidden('w1', true)))
    const added = run(addWidget('s1', 'welcome', 'fresh'), hiddenOnly)
    expect(added.sections[0].layout!.find((r) => r.i === 'fresh')).toMatchObject({ x: 0, y: 0 })
    const shown = run(setWidgetHidden('w1', false), added) // w1 sits at (0,0) which 'fresh' now holds
    expect(shown.sections[0].layout!.find((r) => r.i === 'w1')).not.toMatchObject({ x: 0, y: 0 })
  })
  it('adds to a stack section without creating a layout', () => {
    const config = run(addWidget('s2', 'gallery', 'g1'))
    expect(config.sections[1].widgets.map((w) => w.id)).toEqual(['w4', 'g1'])
    expect(config.sections[1].layout).toBeUndefined()
  })
  it('does not share default props between widgets', () => {
    const config = run(addWidget('s2', 'tasks', 'b'), run(addWidget('s2', 'tasks', 'a')))
    const [a, b] = config.sections[1].widgets.slice(-2)
    expect(a.props).not.toBe(b.props)
    expect(DEFAULT_WIDGET_PROPS.tasks.items).toEqual([])
  })
  it('refuses unknown types, unknown sections, reused ids and the widget limit', () => {
    expect(fails(addWidget('s1', 'kanban', 'x'))).toMatch(/not a widget type/)
    expect(fails(addWidget('constructor', 'notes', 'x'))).toMatch(/not found/)
    expect(fails(addWidget('s1', 'constructor', 'x'))).toMatch(/not a widget type/)
    for (const used of ['w1', 's1', 'nav-a', 't1']) expect(fails(addWidget('s1', 'notes', used))).toMatch(/already in use/)
    let config = sample()
    const room = MAX_WIDGETS - config.sections.reduce((n, s) => n + s.widgets.length, 0)
    for (let n = 0; n < room; n += 1) config = run(addWidget('s2', 'notes', `fill-${n}`), config)
    expect(fails(addWidget('s2', 'notes', 'over'), config)).toMatch(/at most/)
  })
  it('does not mutate its input', () => {
    const before = sample()
    expect(() => addWidget('s1', 'notes', 'zz')(before)).not.toThrow() // frozen input
  })
})

describe('setWidgetHidden', () => {
  it('hides a widget but keeps its geometry', () => {
    const config = run(setWidgetHidden('w1', true))
    expect(config.sections[0].widgets[0].hidden).toBe(true)
    expect(config.sections[0].layout).toEqual(sample().sections[0].layout)
  })
  it('shows a widget in place when its space is free', () => {
    const hidden = run(setWidgetHidden('w2', true))
    expect(run(setWidgetHidden('w2', false), hidden).sections[0].layout).toEqual(sample().sections[0].layout)
  })
  it('moves a shown widget to free space instead of overlapping a visible widget', () => {
    // w3 is hidden at (0,0,4,4) which w1 occupies, so showing it must relocate it.
    const config = run(setWidgetHidden('w3', false))
    const rect = config.sections[0].layout!.find((r) => r.i === 'w3')!
    expect(rect).toMatchObject({ w: 4, h: 4 })
    expect(rect).not.toMatchObject({ x: 0, y: 0 })
    expect(config.sections[0].layout!.filter((r) => r.i !== 'w3')).toEqual(sample().sections[0].layout!.filter((r) => r.i !== 'w3'))
  })
  it('is a no-op when nothing changes and fails for unknown widgets', () => {
    const before = sample()
    const result = setWidgetHidden('w1', false)(before)
    expect(result.ok && result.config).toBe(before)
    expect(fails(setWidgetHidden('nope', true))).toMatch(/not found/)
  })
})

describe('removeWidget', () => {
  it('removes the widget and its rectangle, leaving the rest alone', () => {
    const before = sample()
    const config = run(removeWidget('w1'), before)
    expect(config.sections[0].widgets.map((w) => w.id)).toEqual(['w2', 'w3'])
    expect(config.sections[0].layout!.map((r) => r.i)).toEqual(['w2', 'w3'])
    expect(config.sections[1]).toBe(before.sections[1]) // untouched branches are shared
  })
  it('works for a hidden widget and for a stack widget, and frees its item ids', () => {
    const config = run(removeWidget('w3'))
    expect(collectIds(config).has('t1')).toBe(false)
    expect(run(removeWidget('w4')).sections[1].widgets).toEqual([])
  })
  it('fails for an unknown widget', () => {
    expect(fails(removeWidget('nope'))).toMatch(/not found/)
  })
})

describe('sections', () => {
  it('adds grid sections with an empty layout and stack sections without one', () => {
    const grid = run(addSection('grid', 'sg', 'Grid'))
    expect(grid.sections.at(-1)).toEqual({ id: 'sg', kind: 'grid', title: 'Grid', hidden: false, widgets: [], layout: [] })
    const stack = run(addSection('stack', 'ss', 'Stack'))
    expect(stack.sections.at(-1)).toEqual({ id: 'ss', kind: 'stack', title: 'Stack', hidden: false, widgets: [] })
  })
  it('enforces the section limit, id uniqueness and title length', () => {
    let config = sample()
    for (let n = config.sections.length; n < MAX_SECTIONS; n += 1) config = run(addSection('stack', `x${n}`, 't'), config)
    expect(fails(addSection('stack', 'extra', 't'), config)).toMatch(/at most/)
    expect(fails(addSection('stack', 'w1', 't'))).toMatch(/already in use/)
    expect(fails(addSection('stack', 'long', 'x'.repeat(121)))).toMatch(/at most/)
    expect(fails(setSectionTitle('s1', 'x'.repeat(121)))).toMatch(/at most/)
  })
  it('renames and hides/shows, with no-ops returning the same config', () => {
    const before = sample()
    expect(run(setSectionTitle('s1', 'Renamed')).sections[0].title).toBe('Renamed')
    expect(run(setSectionHidden('s2', true)).sections[1].hidden).toBe(true)
    const same = setSectionTitle('s1', 'Main')(before)
    expect(same.ok && same.config).toBe(before)
    const unchanged = setSectionHidden('s1', false)(before)
    expect(unchanged.ok && unchanged.config).toBe(before)
    expect(fails(setSectionTitle('nope', 'x'))).toMatch(/not found/)
    expect(fails(setSectionHidden('nope', true))).toMatch(/not found/)
  })
  it('removes a section with its widgets and sets only its navigation targets to null', () => {
    const config = run(removeSection('s1'))
    expect(config.sections.map((s) => s.id)).toEqual(['s2'])
    expect(config.navigation.primaryItems).toEqual([
      { id: 'nav-a', label: 'Main', targetSectionId: null, icon: 'home' },
      { id: 'nav-b', label: 'Other', targetSectionId: 's2', icon: 'home' },
    ])
    expect(config.navigation.secondaryItems[0].targetSectionId).toBeNull()
    expect(config.navigation.primaryItems).toHaveLength(2) // items are kept, not deleted
    expect(fails(removeSection('nope'))).toMatch(/not found/)
  })
  it('leaves navigation untouched when nothing pointed at the removed section', () => {
    const base = run(addSection('stack', 'lonely', 'Lonely'))
    const config = run(removeSection('lonely'), base)
    expect(config.navigation).toBe(base.navigation)
  })
})
