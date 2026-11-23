import type { Command } from './commands'
import { MAX_LABEL, MAX_LIST_ITEMS } from './constants'
import { collectIds } from './lifecycle'
import { editItems } from './lists'
import type { Metric, WorkspaceConfig } from './types'

/** Typed commands for the metrics of an Analytics widget. Values must be finite numbers. */

const length = (text: string) => Array.from(text).length

const edit = (widgetId: string, change: (items: Metric[], config: WorkspaceConfig) => Metric[] | string): Command =>
  editItems(widgetId, 'analytics', 'metrics', 'an analytics widget', change)

function problem(label: string | undefined, value: number | undefined): string | null {
  if (label !== undefined) {
    if (label.trim() === '') return 'A metric needs a label.'
    if (length(label) > MAX_LABEL) return `A label can be at most ${MAX_LABEL} characters.`
  }
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) return 'A metric value must be a finite number.'
  return null
}

export function addMetric(widgetId: string, metricId: string, label: string, value: number): Command {
  return edit(widgetId, (items, config) => {
    const issue = problem(label, value)
    if (issue) return issue
    if (items.length >= MAX_LIST_ITEMS) return `A widget can hold at most ${MAX_LIST_ITEMS} metrics.`
    if (collectIds(config).has(metricId)) return `The id ${metricId} is already in use.`
    return [...items, { id: metricId, label: label.trim(), value }]
  })
}

export interface MetricPatch { label?: string; value?: number }

export function updateMetric(widgetId: string, metricId: string, patch: MetricPatch): Command {
  return edit(widgetId, (items) => {
    const index = items.findIndex((m) => m.id === metricId)
    if (index === -1) return `Metric ${metricId} was not found.`
    const issue = problem(patch.label, patch.value)
    if (issue) return issue
    const current = items[index]
    const next: Metric = {
      ...current,
      ...(patch.label !== undefined && { label: patch.label.trim() }),
      ...(patch.value !== undefined && { value: patch.value }),
    }
    if (next.label === current.label && Object.is(next.value, current.value)) return items
    return items.map((m, n) => (n === index ? next : m))
  })
}

export function removeMetric(widgetId: string, metricId: string): Command {
  return edit(widgetId, (items) => (items.some((m) => m.id === metricId) ? items.filter((m) => m.id !== metricId) : `Metric ${metricId} was not found.`))
}
