import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { deepFreeze } from './immutable'
import { setNavPlacement, updateNavItem } from './navigation'
import { parseWorkspaceConfig } from './parse'
import type { IconName, NavPlacement, WorkspaceConfig } from './types'

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Nav',
    navigation: {
      placement: 'left',
      primaryItems: [{ id: 'p1', label: 'Home', targetSectionId: 's1', icon: 'home' }, { id: 'p2', label: 'Docs', targetSectionId: null, icon: 'folder' }],
      secondaryItems: [{ id: 'q1', label: 'Help', targetSectionId: 's2', icon: 'mail' }],
    },
    sections: [{ id: 's1', kind: 'stack', title: 'One' }, { id: 's2', kind: 'stack', title: 'Two' }],
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
const error = (command: Command) => {
  const result = command(sample())
  return result.ok ? null : result.error
}

describe('setNavPlacement', () => {
  it('changes only the placement and never touches item data, in any order of moves', () => {
    const start = sample()
    let config = start
    for (const placement of ['top', 'right', 'left', 'top'] as NavPlacement[]) {
      config = run(setNavPlacement(placement), config)
      expect(config.navigation.placement).toBe(placement)
      expect(config.navigation.primaryItems).toBe(start.navigation.primaryItems)
      expect(config.navigation.secondaryItems).toBe(start.navigation.secondaryItems)
    }
  })
  it('is a no-op for the current placement and rejects values outside the allowlist', () => {
    const start = sample()
    const same = setNavPlacement('left')(start)
    expect(same.ok && same.config).toBe(start)
    expect(error(setNavPlacement('bottom' as NavPlacement))).toMatch(/not a navigation placement/)
    expect(error(setNavPlacement('constructor' as NavPlacement))).toMatch(/not a navigation placement/)
  })
})

describe('updateNavItem', () => {
  it('edits label, target and icon in place without changing order or group', () => {
    let config = run(updateNavItem('p2', { label: 'Documents' }))
    config = run(updateNavItem('p2', { targetSectionId: 's2', icon: 'notebook' }), config)
    expect(config.navigation.primaryItems).toEqual([
      { id: 'p1', label: 'Home', targetSectionId: 's1', icon: 'home' },
      { id: 'p2', label: 'Documents', targetSectionId: 's2', icon: 'notebook' },
    ])
    expect(config.navigation.secondaryItems).toEqual(sample().navigation.secondaryItems)
  })
  it('finds items in the secondary group and can clear a target', () => {
    const config = run(updateNavItem('q1', { targetSectionId: null }))
    expect(config.navigation.secondaryItems[0].targetSectionId).toBeNull()
  })
  it('refuses unknown items, missing sections, unknown icons and over-long labels', () => {
    expect(error(updateNavItem('nope', { label: 'x' }))).toMatch(/not found/)
    expect(error(updateNavItem('p1', { targetSectionId: 'ghost' }))).toMatch(/does not exist/)
    expect(error(updateNavItem('p1', { icon: 'skull' as IconName }))).toMatch(/not an available icon/)
    expect(error(updateNavItem('p1', { label: 'x'.repeat(121) }))).toMatch(/at most/)
  })
  it('returns the same config when nothing changes', () => {
    const start = sample()
    const result = updateNavItem('p1', { label: 'Home', icon: 'home', targetSectionId: 's1' })(start)
    expect(result.ok && result.config).toBe(start)
  })
})
