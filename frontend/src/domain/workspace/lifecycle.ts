import type { Command } from './commands'
import { fail, ok } from './commands'
import { KNOWN_WIDGET_TYPES, MAX_LABEL, MAX_SECTIONS, MAX_WIDGETS } from './constants'
import { DEFAULT_WIDGET_PROPS } from './defaults'
import { defaultSizeFor, findFreePosition, overlaps } from './placement'
import { settleSection } from './grid'
import type { GridRect, KnownWidgetType, NavItem, Section, SectionKind, Widget, WorkspaceConfig } from './types'

/*
 * Lifecycle commands: add / hide / show / remove for widgets and sections. Like every command they
 * are pure, return the same config for a no-op, and are re-validated by the editor store. IDs are
 * passed in so the commands stay deterministic; callers generate them with `newId`.
 */

const isKnown = (type: string): type is KnownWidgetType => (KNOWN_WIDGET_TYPES as readonly string[]).includes(type)
const length = (text: string) => Array.from(text).length

/** Every id in the document (sections, widgets, nav items and list entries); all share one namespace. */
export function collectIds(config: WorkspaceConfig): Set<string> {
  const ids = new Set<string>()
  for (const item of [...config.navigation.primaryItems, ...config.navigation.secondaryItems]) ids.add(item.id)
  for (const section of config.sections) {
    ids.add(section.id)
    for (const widget of section.widgets) {
      ids.add(widget.id)
      for (const value of Object.values(widget.props)) {
        if (!Array.isArray(value)) continue
        for (const entry of value) {
          const entryId = (entry as { id?: unknown } | null)?.id
          if (typeof entryId === 'string') ids.add(entryId)
        }
      }
    }
  }
  return ids
}

const widgetCount = (config: WorkspaceConfig) => config.sections.reduce((sum, s) => sum + s.widgets.length, 0)

function replaceSection(config: WorkspaceConfig, sectionId: string, next: Section): WorkspaceConfig {
  return { ...config, sections: config.sections.map((s) => (s.id === sectionId ? next : s)) }
}

const visibleRects = (section: Section, exceptId?: string): GridRect[] => {
  const hidden = new Set(section.widgets.filter((w) => w.hidden).map((w) => w.id))
  return (section.layout ?? []).filter((r) => r.i !== exceptId && !hidden.has(r.i))
}

export function addWidget(sectionId: string, type: string, widgetId: string): Command {
  return (config) => {
    const section = config.sections.find((s) => s.id === sectionId)
    if (!section) return fail(`Section ${sectionId} was not found.`)
    if (!isKnown(type)) return fail(`${type} is not a widget type you can add.`)
    if (widgetCount(config) >= MAX_WIDGETS) return fail(`A workspace can hold at most ${MAX_WIDGETS} widgets.`)
    if (collectIds(config).has(widgetId)) return fail(`The id ${widgetId} is already in use.`)

    const widget: Widget = {
      id: widgetId, type, title: '', hidden: false, appearance: {},
      props: structuredClone(DEFAULT_WIDGET_PROPS[type]) as unknown as Record<string, unknown>,
    }
    const next: Section = { ...section, widgets: [...section.widgets, widget] }
    if (section.kind === 'grid') {
      const { w, h } = defaultSizeFor(type)
      next.layout = [...(section.layout ?? []), { i: widgetId, ...findFreePosition(visibleRects(section), w, h), w, h }]
    }
    return ok(replaceSection(config, sectionId, next))
  }
}

/**
 * Hide or show a widget. Hiding keeps its own geometry but closes the gap it leaves. Showing keeps it too unless that space is now
 * taken by a visible widget, in which case it moves to the first free position of the same size.
 */
export function setWidgetHidden(widgetId: string, hidden: boolean): Command {
  return (config) => {
    const section = config.sections.find((s) => s.widgets.some((w) => w.id === widgetId))
    if (!section) return fail(`Widget ${widgetId} was not found.`)
    const widget = section.widgets.find((w) => w.id === widgetId)!
    if (widget.hidden === hidden) return ok(config)

    const next: Section = { ...section, widgets: section.widgets.map((w) => (w.id === widgetId ? { ...w, hidden } : w)) }
    if (!hidden && section.kind === 'grid') {
      const rect = section.layout?.find((r) => r.i === widgetId)
      if (rect) {
        const others = visibleRects(section, widgetId)
        if (others.some((other) => overlaps(other, rect))) {
          const moved = { ...rect, ...findFreePosition(others, rect.w, rect.h) }
          next.layout = section.layout!.map((r) => (r.i === widgetId ? moved : r))
        }
      }
    }
    // Hiding frees its space, so the cards below move up to fill it (showing it again finds a free spot).
    return ok(replaceSection(config, section.id, hidden ? settleSection(next) : next))
  }
}

export function removeWidget(widgetId: string): Command {
  return (config) => {
    const section = config.sections.find((s) => s.widgets.some((w) => w.id === widgetId))
    if (!section) return fail(`Widget ${widgetId} was not found.`)
    const next: Section = { ...section, widgets: section.widgets.filter((w) => w.id !== widgetId) }
    if (section.layout) next.layout = section.layout.filter((r) => r.i !== widgetId)
    return ok(replaceSection(config, section.id, settleSection(next))) // the space it leaves is closed up
  }
}

export function addSection(kind: SectionKind, sectionId: string, title: string): Command {
  return (config) => {
    if (config.sections.length >= MAX_SECTIONS) return fail(`A workspace can hold at most ${MAX_SECTIONS} sections.`)
    if (collectIds(config).has(sectionId)) return fail(`The id ${sectionId} is already in use.`)
    if (length(title) > MAX_LABEL) return fail(`A title can be at most ${MAX_LABEL} characters.`)
    const section: Section = { id: sectionId, kind, title, hidden: false, widgets: [], ...(kind === 'grid' && { layout: [] }) }
    return ok({ ...config, sections: [...config.sections, section] })
  }
}

export function setSectionTitle(sectionId: string, title: string): Command {
  return (config) => {
    const section = config.sections.find((s) => s.id === sectionId)
    if (!section) return fail(`Section ${sectionId} was not found.`)
    if (length(title) > MAX_LABEL) return fail(`A title can be at most ${MAX_LABEL} characters.`)
    return section.title === title ? ok(config) : ok(replaceSection(config, sectionId, { ...section, title }))
  }
}

export function setSectionHidden(sectionId: string, hidden: boolean): Command {
  return (config) => {
    const section = config.sections.find((s) => s.id === sectionId)
    if (!section) return fail(`Section ${sectionId} was not found.`)
    return section.hidden === hidden ? ok(config) : ok(replaceSection(config, sectionId, { ...section, hidden }))
  }
}

/** Remove a section with its widgets and geometry; navigation items that pointed at it point at nothing. */
export function removeSection(sectionId: string): Command {
  return (config) => {
    if (!config.sections.some((s) => s.id === sectionId)) return fail(`Section ${sectionId} was not found.`)
    const clear = (items: NavItem[]) =>
      items.some((i) => i.targetSectionId === sectionId)
        ? items.map((i) => (i.targetSectionId === sectionId ? { ...i, targetSectionId: null } : i))
        : items
    const primaryItems = clear(config.navigation.primaryItems)
    const secondaryItems = clear(config.navigation.secondaryItems)
    const navigation =
      primaryItems === config.navigation.primaryItems && secondaryItems === config.navigation.secondaryItems
        ? config.navigation // nothing pointed at it: share the untouched branch
        : { ...config.navigation, primaryItems, secondaryItems }
    return ok({ ...config, sections: config.sections.filter((s) => s.id !== sectionId), navigation })
  }
}
