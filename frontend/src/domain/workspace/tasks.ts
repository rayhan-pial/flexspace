import type { Command } from './commands'
import { fail, ok } from './commands'
import { MAX_LIST_ITEMS, MAX_TEXT } from './constants'
import { collectIds } from './lifecycle'
import type { Section, TaskItem, Widget, WorkspaceConfig } from './types'

/*
 * Typed commands for the items of a Tasks widget. Task ids are stable (they never change after
 * creation) so later sorting and transfer can address a task by id. Like all commands they are pure,
 * return the same config for a no-op, and are re-validated by the editor store.
 */

const length = (text: string) => Array.from(text).length

function itemsOf(widget: Widget): TaskItem[] {
  return Array.isArray(widget.props.items) ? (widget.props.items as TaskItem[]) : []
}

/** Locate a tasks widget, run `change` on its items, and rebuild only that branch. */
function editTasks(widgetId: string, change: (items: TaskItem[], config: WorkspaceConfig) => TaskItem[] | string): Command {
  return (config) => {
    const section = config.sections.find((s) => s.widgets.some((w) => w.id === widgetId))
    const widget = section?.widgets.find((w) => w.id === widgetId)
    if (!section || !widget) return fail(`Widget ${widgetId} was not found.`)
    if (widget.type !== 'tasks') return fail('That widget is not a task list.')

    const current = itemsOf(widget)
    const result = change(current, config)
    if (typeof result === 'string') return fail(result)
    if (result === current) return ok(config)

    const nextWidget: Widget = { ...widget, props: { ...widget.props, items: result } }
    const nextSection: Section = { ...section, widgets: section.widgets.map((w) => (w.id === widgetId ? nextWidget : w)) }
    return ok({ ...config, sections: config.sections.map((s) => (s.id === section.id ? nextSection : s)) })
  }
}

function checkText(text: string): string | null {
  if (text.trim() === '') return 'A task needs some text.'
  if (length(text) > MAX_TEXT) return `A task can be at most ${MAX_TEXT} characters.`
  return null
}

/** Append a new, unfinished task. The id is supplied by the caller (see `newId`). */
export function addTask(widgetId: string, taskId: string, text: string): Command {
  return editTasks(widgetId, (items, config) => {
    const problem = checkText(text)
    if (problem) return problem
    if (items.length >= MAX_LIST_ITEMS) return `A task list can hold at most ${MAX_LIST_ITEMS} tasks.`
    if (collectIds(config).has(taskId)) return `The id ${taskId} is already in use.`
    return [...items, { id: taskId, text: text.trim(), done: false }]
  })
}

export function setTaskText(widgetId: string, taskId: string, text: string): Command {
  return editTasks(widgetId, (items) => {
    const index = items.findIndex((t) => t.id === taskId)
    if (index === -1) return `Task ${taskId} was not found.`
    const problem = checkText(text)
    if (problem) return problem
    const trimmed = text.trim()
    return items[index].text === trimmed ? items : items.map((t, n) => (n === index ? { ...t, text: trimmed } : t))
  })
}

export function setTaskDone(widgetId: string, taskId: string, done: boolean): Command {
  return editTasks(widgetId, (items) => {
    const index = items.findIndex((t) => t.id === taskId)
    if (index === -1) return `Task ${taskId} was not found.`
    return items[index].done === done ? items : items.map((t, n) => (n === index ? { ...t, done } : t))
  })
}

export function removeTask(widgetId: string, taskId: string): Command {
  return editTasks(widgetId, (items) => {
    if (!items.some((t) => t.id === taskId)) return `Task ${taskId} was not found.`
    return items.filter((t) => t.id !== taskId)
  })
}
