import type { Command } from './commands'
import { fail, ok } from './commands'
import type { Section, Widget, WorkspaceConfig } from './types'

/**
 * Shared plumbing for the typed list commands of tasks, gallery and analytics: find the widget,
 * check its type, let `change` produce the next list (or a refusal message), and rebuild only the
 * branch that changed. Returning the same array from `change` means "nothing to do".
 */
export function editItems<T>(
  widgetId: string,
  widgetType: string,
  key: string,
  noun: string,
  change: (items: T[], config: WorkspaceConfig) => T[] | string,
): Command {
  return (config) => {
    const section = config.sections.find((s) => s.widgets.some((w) => w.id === widgetId))
    const widget = section?.widgets.find((w) => w.id === widgetId)
    if (!section || !widget) return fail(`Widget ${widgetId} was not found.`)
    if (widget.type !== widgetType) return fail(`That widget is not ${noun}.`)

    const current = Array.isArray(widget.props[key]) ? (widget.props[key] as T[]) : []
    const result = change(current, config)
    if (typeof result === 'string') return fail(result)
    if (result === current) return ok(config)

    const nextWidget: Widget = { ...widget, props: { ...widget.props, [key]: result } }
    const nextSection: Section = { ...section, widgets: section.widgets.map((w) => (w.id === widgetId ? nextWidget : w)) }
    return ok({ ...config, sections: config.sections.map((s) => (s.id === section.id ? nextSection : s)) })
  }
}
