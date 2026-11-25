import type { Section, WorkspaceConfig } from '../../domain/workspace/types'
import { resolveSelection } from './selection'

export const kindLabel = (section: Section) => (section.kind === 'grid' ? 'dashboard grid' : 'stack')

/**
 * Destination choices: the visible sections in workspace order. Duplicate (or empty) titles get their
 * position in the workspace appended so two "Overview" sections can always be told apart.
 */
export function destinationOptions(draft: WorkspaceConfig): Array<{ section: Section; label: string }> {
  const visible = draft.sections.filter((s) => !s.hidden)
  const names = visible.map((s) => s.title.trim() || 'Untitled section')
  return visible.map((section, index) => {
    const duplicated = names.filter((name) => name === names[index]).length > 1
    const position = draft.sections.indexOf(section) + 1
    return { section, label: `${names[index]}${duplicated ? ` (section ${position})` : ''} · ${kindLabel(section)}` }
  })
}

/**
 * The default destination, never a hidden section: the selected section if it is visible, else the
 * visible section that owns the selected widget, else the first visible section.
 */
export function defaultDestination(draft: WorkspaceConfig, selection: Parameters<typeof resolveSelection>[1]): Section | null {
  const resolved = resolveSelection(draft, selection)
  const selected = resolved?.kind === 'section' || resolved?.kind === 'widget' ? resolved.section : null
  if (selected && !selected.hidden) return selected
  return draft.sections.find((s) => !s.hidden) ?? null
}
