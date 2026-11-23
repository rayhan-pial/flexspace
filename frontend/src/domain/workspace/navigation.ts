import type { Command } from './commands'
import { fail, ok } from './commands'
import { ICONS, MAX_LABEL, NAV_PLACEMENTS } from './constants'
import type { IconName, NavItem, NavPlacement, WorkspaceConfig } from './types'

const length = (text: string) => Array.from(text).length

/** Move the one navigation model between top, left and right. Item data is never touched. */
export function setNavPlacement(placement: NavPlacement): Command {
  return (config) => {
    if (!(NAV_PLACEMENTS as readonly string[]).includes(placement)) return fail(`${placement} is not a navigation placement.`)
    return config.navigation.placement === placement ? ok(config) : ok({ ...config, navigation: { ...config.navigation, placement } })
  }
}

export interface NavItemPatch {
  label?: string
  /** A section id, or `null` for "goes nowhere". */
  targetSectionId?: string | null
  icon?: IconName
}

/** Edit one navigation item in place, found by id in either group; order and group are kept. */
export function updateNavItem(itemId: string, patch: NavItemPatch): Command {
  return (config) => {
    const group = (['primaryItems', 'secondaryItems'] as const).find((key) => config.navigation[key].some((i) => i.id === itemId))
    if (!group) return fail(`Navigation item ${itemId} was not found.`)
    const item = config.navigation[group].find((i) => i.id === itemId)!

    if (patch.label !== undefined && length(patch.label) > MAX_LABEL) return fail(`A label can be at most ${MAX_LABEL} characters.`)
    if (patch.icon !== undefined && !(ICONS as readonly string[]).includes(patch.icon)) return fail(`${patch.icon} is not an available icon.`)
    if (patch.targetSectionId && !config.sections.some((s) => s.id === patch.targetSectionId)) {
      return fail('That section does not exist.')
    }

    const next: NavItem = {
      ...item,
      ...(patch.label !== undefined && { label: patch.label }),
      ...(patch.targetSectionId !== undefined && { targetSectionId: patch.targetSectionId }),
      ...(patch.icon !== undefined && { icon: patch.icon }),
    }
    if (next.label === item.label && next.targetSectionId === item.targetSectionId && next.icon === item.icon) return ok(config)

    const navigation: WorkspaceConfig['navigation'] = {
      ...config.navigation,
      [group]: config.navigation[group].map((i) => (i.id === itemId ? next : i)),
    }
    return ok({ ...config, navigation })
  }
}
