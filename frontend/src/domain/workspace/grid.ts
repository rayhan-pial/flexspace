import type { Command } from './commands'
import { fail, ok } from './commands'
import { GRID_COLUMNS, MAX_ROW_H } from './constants'
import { compactLayout, minSizeFor, overlaps, spatialOrder } from './placement'
import type { GridRect, Section, Widget, WorkspaceConfig } from './types'

/*
 * Spatial editing commands for grid sections: the only way a drag, a resize or a keyboard move
 * changes geometry. The grid adapter calls `commitGridLayout` once when a gesture ends.
 */

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

function replaceSection(config: WorkspaceConfig, next: Section): WorkspaceConfig {
  return { ...config, sections: config.sections.map((s) => (s.id === next.id ? next : s)) }
}

/** Why a rectangle is not allowed for a widget, or `null` when it is fine. */
function problem(rect: GridRect, widget: Widget): string | null {
  if (![rect.x, rect.y, rect.w, rect.h].every(isInt)) return 'Positions and sizes must be whole grid cells.'
  if (rect.x < 0 || rect.y < 0) return 'That is outside the grid.'
  if (rect.w < 1 || rect.x + rect.w > GRID_COLUMNS) return 'That is outside the grid.'
  if (rect.h > MAX_ROW_H) return 'That is taller than the grid allows.'
  const [minW, minH] = minSizeFor(widget.type)
  if (rect.w < minW || rect.h < minH) return 'That is smaller than this widget can be.'
  return null
}

/**
 * Visible array slots receive the visible widgets in spatial (y, x, id) order; hidden widgets keep
 * their positions in the array, so array order and spatial order agree for what is on screen.
 */
function syncOrder(widgets: Widget[], rects: readonly GridRect[]): Widget[] {
  const byId = new Map(widgets.map((w) => [w.id, w]))
  const queue = spatialOrder(rects.filter((r) => byId.has(r.i) && !byId.get(r.i)!.hidden)).map((id) => byId.get(id)!)
  return widgets.map((w) => (w.hidden ? w : queue.shift()!))
}

/**
 * Commit the final layout of a drag or resize: `rects` must hold exactly the section's visible
 * widgets. The visible result is validated, compacted upward, and hidden rectangles are kept as
 * they were. Fails (leaving the draft alone) on any overlap, bound or minimum-size violation.
 */
export function commitGridLayout(sectionId: string, rects: readonly GridRect[]): Command {
  return (config) => {
    const section = config.sections.find((s) => s.id === sectionId)
    if (!section || section.kind !== 'grid') return fail(`Grid section ${sectionId} was not found.`)
    const visible = section.widgets.filter((w) => !w.hidden)
    const byId = new Map(visible.map((w) => [w.id, w]))
    if (rects.length !== visible.length || new Set(rects.map((r) => r.i)).size !== rects.length || rects.some((r) => !byId.has(r.i))) {
      return fail('The layout does not match the visible widgets.')
    }
    for (const rect of rects) {
      const issue = problem(rect, byId.get(rect.i)!)
      if (issue) return fail(issue)
    }
    if (rects.some((a, n) => rects.slice(n + 1).some((b) => overlaps(a, b)))) return fail('Widgets cannot overlap.')

    const compacted = new Map(compactLayout(rects.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))).map((r) => [r.i, r]))
    const layout = (section.layout ?? []).map((r) => compacted.get(r.i) ?? r)
    return ok(replaceSection(config, { ...section, layout, widgets: syncOrder(section.widgets, layout) }))
  }
}

export interface RectChange { dx?: number; dy?: number; dw?: number; dh?: number }

/**
 * Nudge one widget by whole cells (keyboard move / resize). Nothing else moves: a change that
 * would leave the grid, shrink below the minimum or land on a visible widget is refused.
 */
export function nudgeWidget(widgetId: string, change: RectChange): Command {
  return (config) => {
    const section = config.sections.find((s) => s.kind === 'grid' && s.widgets.some((w) => w.id === widgetId))
    if (!section) return fail(`Widget ${widgetId} is not in a grid section.`)
    const widget = section.widgets.find((w) => w.id === widgetId)!
    const rect = section.layout?.find((r) => r.i === widgetId)
    if (!rect) return fail(`Widget ${widgetId} has no position.`)

    const next: GridRect = { i: rect.i, x: rect.x + (change.dx ?? 0), y: rect.y + (change.dy ?? 0), w: rect.w + (change.dw ?? 0), h: rect.h + (change.dh ?? 0) }
    const issue = problem(next, widget)
    if (issue) return fail(issue)
    if (!widget.hidden) {
      const others = (section.layout ?? []).filter((r) => r.i !== widgetId && !section.widgets.find((w) => w.id === r.i)!.hidden)
      if (others.some((other) => overlaps(other, next))) return fail('That space is taken by another widget.')
    }
    const layout = section.layout!.map((r) => (r.i === widgetId ? next : r))
    return ok(replaceSection(config, { ...section, layout, widgets: syncOrder(section.widgets, layout) }))
  }
}
