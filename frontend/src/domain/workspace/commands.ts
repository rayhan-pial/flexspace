import { deepEqual } from './immutable'
import type { Section, Theme, Widget, WorkspaceConfig } from './types'

/**
 * A domain command is a pure function from the current draft to the next one. It must not
 * mutate its input: it returns the same object when nothing changes (a no-op) and otherwise a
 * new config that structurally shares every untouched branch. The editor store validates the
 * result before accepting it, so a command can never leave an unsavable draft.
 */
export type CommandResult = { ok: true; config: WorkspaceConfig } | { ok: false; error: string }
export type Command = (config: WorkspaceConfig) => CommandResult

export const ok = (config: WorkspaceConfig): CommandResult => ({ ok: true, config })
export const fail = (error: string): CommandResult => ({ ok: false, error })

export function setWorkspaceTitle(title: string): Command {
  return (config) => (config.title === title ? ok(config) : ok({ ...config, title }))
}

export function setTheme(patch: Partial<Theme>): Command {
  return (config) => {
    const theme = { ...config.theme, ...patch }
    return deepEqual(theme, config.theme) ? ok(config) : ok({ ...config, theme })
  }
}

export interface WidgetPatch {
  title?: string
  hidden?: boolean
  /** Merged into the existing appearance; a key set to `undefined` is removed. */
  appearance?: Record<string, unknown>
  /** Merged (shallowly) into the existing props. */
  props?: Record<string, unknown>
}

function merge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...base, ...patch }
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
  return next
}

/** Replace only the branch containing `widgetId`, found by ID rather than by index. */
export function updateWidget(widgetId: string, patch: WidgetPatch): Command {
  return (config) => {
    const sectionIndex = config.sections.findIndex((s) => s.widgets.some((w) => w.id === widgetId))
    if (sectionIndex === -1) return fail(`Widget ${widgetId} was not found.`)
    const section = config.sections[sectionIndex]
    const widgetIndex = section.widgets.findIndex((w) => w.id === widgetId)
    const widget = section.widgets[widgetIndex]

    const next: Widget = {
      ...widget,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.hidden !== undefined && { hidden: patch.hidden }),
      ...(patch.appearance && { appearance: merge(widget.appearance, patch.appearance) }),
      ...(patch.props && { props: merge(widget.props, patch.props) }),
    }
    if (deepEqual(next, widget)) return ok(config)

    const widgets = section.widgets.map((w, i) => (i === widgetIndex ? next : w))
    const nextSection: Section = { ...section, widgets }
    return ok({ ...config, sections: config.sections.map((s, i) => (i === sectionIndex ? nextSection : s)) })
  }
}
