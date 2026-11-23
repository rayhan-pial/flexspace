import { newId } from './ids'
import type { WorkspaceConfig } from './types'

/**
 * Turn a template snapshot into content for a workspace: a deep copy in which every entity has a
 * brand-new id. That covers sections, widgets, navigation items and the entries inside Tasks,
 * Gallery, Analytics and Calendar widgets, and every reference to them is remapped (navigation
 * targets and grid layout rectangles). Applying the same template twice, or to two workspaces, can
 * therefore never produce clashing ids, and a template's own ids never leak into a workspace.
 *
 * Widgets of types this version does not know keep their opaque props exactly as they are, since
 * any ids inside them cannot be recognised. The input is not modified, and `makeId` is injectable
 * so the result can be made deterministic in tests.
 */
export function instantiateTemplate(template: WorkspaceConfig, makeId: (prefix: string) => string = newId): WorkspaceConfig {
  const config = structuredClone(template)
  const used = new Set<string>()
  const fresh = (prefix: string): string => {
    let id = makeId(prefix)
    while (used.has(id)) id = makeId(prefix) // ids are random; a deterministic generator may repeat
    used.add(id)
    return id
  }

  const sections = new Map<string, string>()
  const remapEntries = (entries: unknown, prefix: string): void => {
    if (!Array.isArray(entries)) return
    for (const entry of entries) {
      if (entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string') (entry as { id: string }).id = fresh(prefix)
    }
  }
  const ENTRY_LISTS: Record<string, [key: string, prefix: string]> = {
    tasks: ['items', 'task'],
    gallery: ['items', 'img'],
    analytics: ['metrics', 'metric'],
    calendar: ['events', 'event'],
  }

  for (const section of config.sections) {
    const newSectionId = fresh('section')
    sections.set(section.id, newSectionId)
    section.id = newSectionId

    const widgetIds = new Map<string, string>()
    for (const widget of section.widgets) {
      const newWidgetId = fresh('widget')
      widgetIds.set(widget.id, newWidgetId)
      widget.id = newWidgetId
      if (Object.hasOwn(ENTRY_LISTS, widget.type)) {
        const [key, prefix] = ENTRY_LISTS[widget.type]
        remapEntries(widget.props[key], prefix)
      }
    }
    if (section.layout) section.layout = section.layout.map((rect) => ({ ...rect, i: widgetIds.get(rect.i) ?? rect.i }))
  }

  for (const group of [config.navigation.primaryItems, config.navigation.secondaryItems]) {
    for (const item of group) {
      item.id = fresh('nav')
      item.targetSectionId = item.targetSectionId === null ? null : (sections.get(item.targetSectionId) ?? null)
    }
  }
  return config
}
