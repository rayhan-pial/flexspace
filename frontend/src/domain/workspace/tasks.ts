import type { Command } from './commands'
import { MAX_LIST_ITEMS, MAX_TEXT } from './constants'
import { collectIds } from './lifecycle'
import { editItems } from './lists'
import type { TaskItem, WorkspaceConfig } from './types'

/*
 * Typed commands for the items of a Tasks widget. Task ids are stable (they never change after
 * creation) so later sorting and transfer can address a task by id. Like all commands they are pure,
 * return the same config for a no-op, and are re-validated by the editor store.
 */

const length = (text: string) => Array.from(text).length

const editTasks = (widgetId: string, change: (items: TaskItem[], config: WorkspaceConfig) => TaskItem[] | string): Command =>
  editItems(widgetId, 'tasks', 'items', 'a task list', change)

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
