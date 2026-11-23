import type { Command } from './commands'
import { fail, ok } from './commands'
import { MAX_LABEL, MAX_LIST_ITEMS } from './constants'
import { isDate, isMonth } from './dates'
import { collectIds } from './lifecycle'
import { editItems } from './lists'
import type { CalendarEvent, Section, Widget, WorkspaceConfig } from './types'

/*
 * Typed commands for a Calendar widget. `displayMonth` is the saved starting month; browsing to
 * other months in the widget is transient and never goes through these commands. The agenda is the
 * widget's `events` array in its stored order; dates inside it may be in any order.
 */

const length = (text: string) => Array.from(text).length

const edit = (widgetId: string, change: (items: CalendarEvent[], config: WorkspaceConfig) => CalendarEvent[] | string): Command =>
  editItems(widgetId, 'calendar', 'events', 'a calendar', change)

function problem(date: string | undefined, title: string | undefined): string | null {
  if (date !== undefined && !isDate(date)) return 'Use a real date between 1900 and 2199.'
  if (title !== undefined) {
    if (title.trim() === '') return 'An event needs a title.'
    if (length(title) > MAX_LABEL) return `A title can be at most ${MAX_LABEL} characters.`
  }
  return null
}

export function addEvent(widgetId: string, eventId: string, date: string, title: string): Command {
  return edit(widgetId, (items, config) => {
    const issue = problem(date, title)
    if (issue) return issue
    if (items.length >= MAX_LIST_ITEMS) return `A calendar can hold at most ${MAX_LIST_ITEMS} events.`
    if (collectIds(config).has(eventId)) return `The id ${eventId} is already in use.`
    return [...items, { id: eventId, date, title: title.trim() }]
  })
}

export interface EventPatch { date?: string; title?: string }

export function updateEvent(widgetId: string, eventId: string, patch: EventPatch): Command {
  return edit(widgetId, (items) => {
    const index = items.findIndex((e) => e.id === eventId)
    if (index === -1) return `Event ${eventId} was not found.`
    const issue = problem(patch.date, patch.title)
    if (issue) return issue
    const current = items[index]
    const next: CalendarEvent = {
      ...current,
      ...(patch.date !== undefined && { date: patch.date }),
      ...(patch.title !== undefined && { title: patch.title.trim() }),
    }
    if (next.date === current.date && next.title === current.title) return items
    return items.map((e, n) => (n === index ? next : e))
  })
}

export function removeEvent(widgetId: string, eventId: string): Command {
  return edit(widgetId, (items) => (items.some((e) => e.id === eventId) ? items.filter((e) => e.id !== eventId) : `Event ${eventId} was not found.`))
}

/** Set the saved starting month (`YYYY-MM`) of a calendar widget. */
export function setDisplayMonth(widgetId: string, month: string): Command {
  return (config) => {
    const section = config.sections.find((s) => s.widgets.some((w) => w.id === widgetId))
    const widget = section?.widgets.find((w) => w.id === widgetId)
    if (!section || !widget) return fail(`Widget ${widgetId} was not found.`)
    if (widget.type !== 'calendar') return fail('That widget is not a calendar.')
    if (!isMonth(month)) return fail('Use a month between 1900 and 2199.')
    if (widget.props.displayMonth === month) return ok(config)

    const nextWidget: Widget = { ...widget, props: { ...widget.props, displayMonth: month } }
    const nextSection: Section = { ...section, widgets: section.widgets.map((w) => (w.id === widgetId ? nextWidget : w)) }
    return ok({ ...config, sections: config.sections.map((s) => (s.id === section.id ? nextSection : s)) })
  }
}
