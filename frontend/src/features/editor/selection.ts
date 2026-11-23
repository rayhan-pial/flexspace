import type { NavItem, Section, Widget, WorkspaceConfig } from '../../domain/workspace/types'

export type Selection = { kind: 'section' | 'widget' | 'navItem'; id: string }

export type ResolvedSelection =
  | { kind: 'widget'; section: Section; widget: Widget }
  | { kind: 'section'; section: Section }
  | { kind: 'navItem'; item: NavItem }

/**
 * Look a selection up in the draft by ID. `null` means the target no longer exists (it was
 * removed, or the draft was replaced), so nothing may be shown for it.
 *
 * A *hidden* widget still resolves: it must stay selectable from the outline so it can be shown
 * again, so its inspector remains valid.
 */
export function resolveSelection(config: WorkspaceConfig | null, selection: Selection | null): ResolvedSelection | null {
  if (!config || !selection) return null
  switch (selection.kind) {
    case 'section': {
      const section = config.sections.find((s) => s.id === selection.id)
      return section ? { kind: 'section', section } : null
    }
    case 'widget':
      for (const section of config.sections) {
        const widget = section.widgets.find((w) => w.id === selection.id)
        if (widget) return { kind: 'widget', section, widget }
      }
      return null
    case 'navItem': {
      const item = [...config.navigation.primaryItems, ...config.navigation.secondaryItems].find((n) => n.id === selection.id)
      return item ? { kind: 'navItem', item } : null
    }
  }
}
