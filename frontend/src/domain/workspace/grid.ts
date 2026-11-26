import type { Command } from './commands'
import { fail, ok } from './commands'
import { GRID_COLUMNS, MAX_ROW_H } from './constants'
import { compactLayout, minSizeFor, overlaps, pushDown, spatialOrder } from './placement'
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
 * Close the gaps in a grid section after something left it (a widget was hidden or removed): the visible
 * rectangles are compacted upward, hidden rectangles are kept as they were, and the array order is brought in
 * step with the visible spatial order. Other kinds of section are returned unchanged.
 */
export function settleSection(section: Section): Section {
  if (section.kind !== 'grid' || !section.layout) return section
  const hiddenIds = new Set(section.widgets.filter((w) => w.hidden).map((w) => w.id))
  const known = new Set(section.widgets.map((w) => w.id))
  const visible = section.layout.filter((r) => known.has(r.i) && !hiddenIds.has(r.i))
  const compacted = new Map(compactLayout(visible.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))).map((r) => [r.i, r]))
  const layout = section.layout.map((r) => compacted.get(r.i) ?? r)
  return { ...section, layout, widgets: syncOrder(section.widgets, layout) }
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

/** What a one-cell step would do, worked out without touching the draft. */
export type NudgePlan = { ok: true; sectionId: string; layout: GridRect[]; widgets: Widget[] } | { ok: false; error: string }

/**
 * The single planner behind keyboard moves, click steps and their availability. A step that leaves
 * the grid or shrinks below the minimum is invalid. A step onto other visible widgets is resolved by
 * pushing just those widgets (and anything they then touch) down out of the way; nothing else moves,
 * no size changes and hidden rectangles are untouched. Pure and free of side effects.
 */
export function planNudge(config: WorkspaceConfig, widgetId: string, change: RectChange): NudgePlan {
  const section = config.sections.find((s) => s.kind === 'grid' && s.widgets.some((w) => w.id === widgetId))
  if (!section) return { ok: false, error: `Widget ${widgetId} is not in a grid section.` }
  const widget = section.widgets.find((w) => w.id === widgetId)!
  const rect = section.layout?.find((r) => r.i === widgetId)
  if (!rect) return { ok: false, error: `Widget ${widgetId} has no position.` }

  const next: GridRect = { i: rect.i, x: rect.x + (change.dx ?? 0), y: rect.y + (change.dy ?? 0), w: rect.w + (change.dw ?? 0), h: rect.h + (change.dh ?? 0) }
  const issue = problem(next, widget)
  if (issue) return { ok: false, error: issue }
  let layout = section.layout!.map((r) => (r.i === widgetId ? next : r))
  if (!widget.hidden) {
    const hiddenIds = new Set(section.widgets.filter((w) => w.hidden).map((w) => w.id))
    const visible = layout.filter((r) => !hiddenIds.has(r.i))
    if (visible.some((other) => other.i !== widgetId && overlaps(other, next))) {
      const pushed = new Map(pushDown(visible, widgetId).map((r) => [r.i, r]))
      layout = layout.map((r) => pushed.get(r.i) ?? r)
    }
  }
  return { ok: true, sectionId: section.id, layout, widgets: syncOrder(section.widgets, layout) }
}

export interface StepAvailability { allowed: boolean; reason: string | null }

/**
 * Whether a one-cell step can run, and if not, why in plain words. Side-effect free: it only reads
 * `config` through `planNudge`, so evaluating it creates no draft, history, id or request.
 */
export function stepAvailability(config: WorkspaceConfig, widgetId: string, change: RectChange): StepAvailability {
  const plan = planNudge(config, widgetId, change)
  if (plan.ok) return { allowed: true, reason: null }
  if (/not in a grid|no position/.test(plan.error)) return { allowed: false, reason: 'This widget is no longer in a grid section.' }
  if ((change.dx ?? 0) < 0) return { allowed: false, reason: 'Already at the left edge of the grid.' }
  if ((change.dx ?? 0) > 0) return { allowed: false, reason: 'Already at the right edge of the grid.' }
  if ((change.dy ?? 0) < 0) return { allowed: false, reason: 'Already at the top of the grid.' }
  if ((change.dw ?? 0) < 0) return { allowed: false, reason: 'Already at the narrowest this widget can be.' }
  if ((change.dw ?? 0) > 0) return { allowed: false, reason: 'No room to the right: it already reaches the edge of the grid.' }
  if ((change.dh ?? 0) < 0) return { allowed: false, reason: 'Already at the shortest this widget can be.' }
  if ((change.dh ?? 0) > 0) return { allowed: false, reason: 'Already at the tallest a widget can be.' }
  return { allowed: false, reason: plan.error }
}

/** Nudge one widget by whole cells (keyboard move / resize), pushing any widgets in the way down. */
export function nudgeWidget(widgetId: string, change: RectChange): Command {
  return (config) => {
    const plan = planNudge(config, widgetId, change)
    if (!plan.ok) return fail(plan.error)
    const section = config.sections.find((s) => s.id === plan.sectionId)!
    return ok(replaceSection(config, { ...section, layout: plan.layout, widgets: plan.widgets }))
  }
}
