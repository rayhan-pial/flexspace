import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import { moveBetween, moveNavItem } from './reorder'
import type { WorkspaceConfig } from './types'

const item = (id: string) => ({ id })
const ids = (list: readonly { id: string }[]) => list.map((i) => i.id)

describe('moveBetween', () => {
  const lists = deepFreeze({ a: [item('1'), item('2'), item('3')], b: [item('4')], empty: [] as Array<{ id: string }> })

  it('reorders inside one list so the item ends at the requested index', () => {
    expect(ids(moveBetween(lists, '1', 'a', 2)!.lists.a)).toEqual(['2', '3', '1'])
    expect(ids(moveBetween(lists, '3', 'a', 0)!.lists.a)).toEqual(['3', '1', '2'])
    expect(ids(moveBetween(lists, '2', 'a', 1)!.lists.a)).toEqual(['1', '2', '3'])
  })
  it('returns the very same lists object when nothing would change', () => {
    expect(moveBetween(lists, '2', 'a', 1)!.lists).toBe(lists)
    expect(moveBetween(lists, '3', 'a', 99)!.lists).toBe(lists) // clamped to the end, where it already is
  })
  it('moves between lists, including into an empty one, with exactly one copy afterwards', () => {
    const toB = moveBetween(lists, '2', 'b', 0)!
    expect(ids(toB.lists.a)).toEqual(['1', '3'])
    expect(ids(toB.lists.b)).toEqual(['2', '4'])
    const toEmpty = moveBetween(lists, '1', 'empty', 0)!
    expect(ids(toEmpty.lists.empty)).toEqual(['1'])
    expect(ids(toEmpty.lists.a)).toEqual(['2', '3'])
    for (const result of [toB, toEmpty]) {
      const all = Object.values(result.lists).flatMap(ids)
      expect(all.sort()).toEqual(['1', '2', '3', '4'])
      expect(new Set(all).size).toBe(all.length)
    }
  })
  it('clamps out-of-range indices and shares the lists it did not touch', () => {
    const result = moveBetween(lists, '1', 'b', 99)!
    expect(result.toIndex).toBe(1)
    expect(ids(result.lists.b)).toEqual(['4', '1'])
    expect(moveBetween(lists, '1', 'b', -5)!.toIndex).toBe(0)
    expect(result.lists.empty).toBe(lists.empty)
  })
  it('refuses unknown items, unknown lists (including prototype names) and non-integer indices', () => {
    expect(moveBetween(lists, 'nope', 'a', 0)).toBeNull()
    expect(moveBetween(lists, '1', 'missing', 0)).toBeNull()
    expect(moveBetween(lists, '1', 'constructor', 0)).toBeNull()
    expect(moveBetween(lists, '1', 'a', 1.5)).toBeNull()
    expect(moveBetween(lists, '1', 'a', Number.NaN)).toBeNull()
  })
  it('does not mutate its input', () => {
    expect(() => moveBetween(lists, '1', 'b', 0)).not.toThrow() // lists are frozen
  })
})

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Nav',
    navigation: {
      placement: 'left',
      primaryItems: [
        { id: 'p1', label: 'One', targetSectionId: 's1', icon: 'home' },
        { id: 'p2', label: 'Two', targetSectionId: null, icon: 'star' },
        { id: 'p3', label: 'Three', targetSectionId: 's1', icon: 'mail' },
      ],
      secondaryItems: [],
    },
    sections: [{ id: 's1', kind: 'stack', title: 'S' }],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return deepFreeze(parsed.config)
}

function run(command: Command, from = sample()): WorkspaceConfig {
  const result = command(from)
  if (!result.ok) throw new Error(result.error)
  const parsed = parseWorkspaceConfig(result.config)
  expect(parsed.ok).toBe(true) // duplicate ids would fail here
  if (parsed.ok) expect(parsed.config).toEqual(result.config)
  return result.config
}
const nav = (config: WorkspaceConfig) => ({ p: ids(config.navigation.primaryItems), s: ids(config.navigation.secondaryItems) })

describe('moveNavItem', () => {
  it('reorders within the primary group, carrying the item data unchanged', () => {
    const config = run(moveNavItem('p1', 'primaryItems', 2))
    expect(nav(config)).toEqual({ p: ['p2', 'p3', 'p1'], s: [] })
    expect(config.navigation.primaryItems[2]).toEqual(sample().navigation.primaryItems[0])
  })
  it('moves an item into the empty secondary group and back', () => {
    const away = run(moveNavItem('p2', 'secondaryItems', 0))
    expect(nav(away)).toEqual({ p: ['p1', 'p3'], s: ['p2'] })
    expect(away.navigation.secondaryItems[0]).toEqual(sample().navigation.primaryItems[1]) // label, target and icon intact
    const back = run(moveNavItem('p2', 'primaryItems', 1), away)
    expect(nav(back)).toEqual({ p: ['p1', 'p2', 'p3'], s: [] })
  })
  it('never duplicates or loses an item, whatever the sequence of moves', () => {
    let config = sample()
    const moves: Array<[string, 'primaryItems' | 'secondaryItems', number]> = [
      ['p1', 'secondaryItems', 0], ['p2', 'secondaryItems', 5], ['p3', 'secondaryItems', 1], ['p1', 'primaryItems', 0],
      ['p3', 'primaryItems', 0], ['p2', 'primaryItems', 1], ['p1', 'primaryItems', 1], ['p1', 'primaryItems', 1],
    ]
    for (const [id, group, index] of moves) {
      config = run(moveNavItem(id, group, index), config)
      const { p, s } = nav(config)
      expect([...p, ...s].sort()).toEqual(['p1', 'p2', 'p3'])
    }
  })
  it('is a no-op (same config object) when the item would stay put', () => {
    const before = sample()
    const result = moveNavItem('p2', 'primaryItems', 1)(before)
    expect(result.ok && result.config).toBe(before)
  })
  it('leaves the untouched group and everything else shared', () => {
    const before = sample()
    const config = run(moveNavItem('p1', 'primaryItems', 2), before)
    expect(config.navigation.secondaryItems).toBe(before.navigation.secondaryItems)
    expect(config.sections).toBe(before.sections)
    expect(config.navigation.placement).toBe('left')
  })
  it('fails for unknown items or groups', () => {
    for (const command of [moveNavItem('nope', 'primaryItems', 0), moveNavItem('p1', 'bogus' as 'primaryItems', 0)]) {
      expect(command(sample()).ok).toBe(false)
    }
  })
})
