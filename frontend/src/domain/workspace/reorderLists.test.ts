import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { MAX_LIST_ITEMS } from './constants'
import { deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import { moveListItem } from './reorder'
import type { GalleryItem, TaskItem, WorkspaceConfig } from './types'

const task = (id: string, text = id, done = false) => ({ id, text, done })
const image = (id: string, caption = id) => ({ id, assetKey: 'aurora', alt: `alt ${id}`, caption })

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Lists',
    sections: [
      {
        id: 's1', kind: 'stack', title: 'Main',
        widgets: [
          { id: 'tA', type: 'tasks', props: { items: [task('t1', 'one', true), task('t2', 'two'), task('t3', 'three')] } },
          { id: 'tB', type: 'tasks', props: { items: [task('t4', 'four')] } },
          { id: 'tE', type: 'tasks', props: { items: [] } },
          { id: 'gA', type: 'gallery', props: { items: [image('i1', 'sunrise'), image('i2'), image('i3')] } },
          { id: 'gE', type: 'gallery', props: { items: [] } },
          { id: 'note', type: 'notes', props: { body: 'not a list' } },
        ],
      },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return deepFreeze(parsed.config)
}

function run(command: Command, from = sample()): WorkspaceConfig {
  const result = command(from)
  if (!result.ok) throw new Error(result.error)
  const parsed = parseWorkspaceConfig(result.config)
  expect(parsed.ok).toBe(true) // duplicate ids anywhere would fail here
  if (parsed.ok) expect(parsed.config).toEqual(result.config)
  return result.config
}
const refusal = (command: Command, from = sample()) => {
  const result = command(from)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}
const items = <T,>(config: WorkspaceConfig, widgetId: string) => config.sections[0].widgets.find((w) => w.id === widgetId)!.props.items as T[]
const ids = (list: Array<{ id: string }>) => list.map((i) => i.id)
const everyId = (config: WorkspaceConfig, kind: 'tasks' | 'gallery') =>
  config.sections[0].widgets.filter((w) => w.type === kind).flatMap((w) => ids(w.props.items as Array<{ id: string }>)).sort()

describe('moveListItem: tasks', () => {
  it('reorders rows inside one widget', () => {
    expect(ids(items(run(moveListItem('tasks', 't1', 'tA', 2)), 'tA'))).toEqual(['t2', 't3', 't1'])
    expect(ids(items(run(moveListItem('tasks', 't3', 'tA', 0)), 'tA'))).toEqual(['t3', 't1', 't2'])
  })
  it('transfers a task to another Tasks widget, keeping its text and completion', () => {
    const config = run(moveListItem('tasks', 't1', 'tB', 0))
    expect(ids(items(config, 'tA'))).toEqual(['t2', 't3'])
    expect(items<TaskItem>(config, 'tB')[0]).toEqual({ id: 't1', text: 'one', done: true })
    expect(everyId(config, 'tasks')).toEqual(['t1', 't2', 't3', 't4']) // each exactly once
  })
  it('transfers into an empty Tasks widget', () => {
    const config = run(moveListItem('tasks', 't4', 'tE', 0))
    expect(ids(items(config, 'tE'))).toEqual(['t4'])
    expect(items(config, 'tB')).toEqual([])
  })
  it('is a no-op (same config) when nothing changes, and shares every untouched widget', () => {
    const before = sample()
    const same = moveListItem('tasks', 't2', 'tA', 1)(before)
    expect(same.ok && same.config).toBe(before)
    const moved = run(moveListItem('tasks', 't2', 'tB', 1), before)
    const widgetOf = (c: WorkspaceConfig, id: string) => c.sections[0].widgets.find((w) => w.id === id)
    expect(widgetOf(moved, 'tE')).toBe(widgetOf(before, 'tE'))
    expect(widgetOf(moved, 'gA')).toBe(widgetOf(before, 'gA'))
  })
  it('clamps the index', () => {
    expect(ids(items(run(moveListItem('tasks', 't1', 'tB', 99)), 'tB'))).toEqual(['t4', 't1'])
    expect(ids(items(run(moveListItem('tasks', 't4', 'tA', -3)), 'tA'))).toEqual(['t4', 't1', 't2', 't3'])
  })
  it('refuses a destination that already holds the maximum number of items', () => {
    const full = parseWorkspaceConfig({
      schemaVersion: 1, title: 'Full',
      sections: [{ id: 's1', kind: 'stack', title: 'S', widgets: [
        { id: 'big', type: 'tasks', props: { items: Array.from({ length: MAX_LIST_ITEMS }, (_, n) => task(`b${n}`)) } },
        { id: 'small', type: 'tasks', props: { items: [task('s1x')] } },
      ] }],
    })
    if (!full.ok) throw new Error(full.message)
    expect(refusal(moveListItem('tasks', 's1x', 'big', 0), full.config)).toMatch(/already holds 100/)
    expect(run(moveListItem('tasks', 'b0', 'big', 5), full.config).sections).toBeDefined() // reordering inside a full list is fine
  })
})

describe('moveListItem: gallery', () => {
  it('reorders tiles and transfers them between galleries, keeping caption and picture', () => {
    expect(ids(items(run(moveListItem('gallery', 'i3', 'gA', 0)), 'gA'))).toEqual(['i3', 'i1', 'i2'])
    const config = run(moveListItem('gallery', 'i1', 'gE', 0))
    expect(items<GalleryItem>(config, 'gE')).toEqual([{ id: 'i1', assetKey: 'aurora', alt: 'alt i1', caption: 'sunrise' }])
    expect(ids(items(config, 'gA'))).toEqual(['i2', 'i3'])
    expect(everyId(config, 'gallery')).toEqual(['i1', 'i2', 'i3'])
  })
})

describe('moveListItem: types never mix', () => {
  it('a task cannot be moved into a gallery, a tile cannot be moved into a Tasks widget', () => {
    const before = sample()
    expect(refusal(moveListItem('tasks', 't1', 'gE', 0))).toMatch(/only be moved into another tasks widget/)
    expect(refusal(moveListItem('tasks', 't1', 'gA', 0))).toMatch(/only be moved into another tasks widget/)
    expect(refusal(moveListItem('gallery', 'i1', 'tE', 0))).toMatch(/only be moved into another gallery widget/)
    expect(refusal(moveListItem('gallery', 't1', 'gA', 0))).toMatch(/was not found in any gallery/) // a task id is not a tile
    expect(refusal(moveListItem('tasks', 'i1', 'tA', 0))).toMatch(/was not found in any tasks/)
    expect(everyId(before, 'tasks')).toEqual(['t1', 't2', 't3', 't4'])
  })
  it('refuses unknown items, unknown widgets, non-list widgets and prototype names', () => {
    expect(refusal(moveListItem('tasks', 'nope', 'tA', 0))).toMatch(/not found/)
    expect(refusal(moveListItem('tasks', 't1', 'missing', 0))).toMatch(/only be moved into another tasks/)
    expect(refusal(moveListItem('tasks', 't1', 'note', 0))).toMatch(/only be moved into another tasks/)
    expect(refusal(moveListItem('tasks', 't1', 'constructor', 0))).toMatch(/only be moved into another tasks/)
    expect(refusal(moveListItem('tasks', 't1', 'tA', 1.5))).toMatch(/could not be moved/)
  })
  it('keeps every item exactly once across any sequence of moves', () => {
    let config = sample()
    const moves: Array<['tasks' | 'gallery', string, string, number]> = [
      ['tasks', 't1', 'tE', 0], ['tasks', 't2', 'tE', 0], ['tasks', 't4', 'tA', 9], ['tasks', 't1', 'tB', 0], ['tasks', 't3', 'tE', 1],
      ['gallery', 'i1', 'gE', 0], ['gallery', 'i2', 'gE', 0], ['gallery', 'i1', 'gA', 5], ['gallery', 'i3', 'gE', 1],
    ]
    for (const [kind, id, to, index] of moves) {
      config = run(moveListItem(kind, id, to, index), config)
      expect(everyId(config, 'tasks')).toEqual(['t1', 't2', 't3', 't4'])
      expect(everyId(config, 'gallery')).toEqual(['i1', 'i2', 'i3'])
    }
  })
})
