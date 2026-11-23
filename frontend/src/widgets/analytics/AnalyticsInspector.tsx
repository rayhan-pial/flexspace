import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { addMetric, removeMetric, updateMetric } from '../../domain/workspace/analytics'
import type { Command } from '../../domain/workspace/commands'
import { MAX_LABEL, MAX_LIST_ITEMS } from '../../domain/workspace/constants'
import { newId } from '../../domain/workspace/ids'
import type { AnalyticsProps } from '../../domain/workspace/types'
import { CommitTextField, NumberField } from '../../shared/ui/fields'
import MoveButtons from '../../features/sorting/MoveButtons'
import { listContainerId, workspaceAdapter } from '../../features/sorting/workspaceAdapter'
import type { WidgetInspectorProps } from '../types'

/** Add, rename, re-value and remove the metrics of the selected analytics widget. */
export default function AnalyticsInspector({ widgetId, props, dispatch }: WidgetInspectorProps<AnalyticsProps>) {
  const [error, setError] = useState<string | null>(null)

  function run(command: Command): boolean {
    const result = dispatch(command)
    setError(result.ok ? null : result.error)
    return result.ok
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">Metrics ({props.metrics.length})</legend>
      {props.metrics.length === 0 && <p className="text-sm text-slate-500">No metrics yet.</p>}

      <ul className="space-y-3">
        {props.metrics.map((metric, index) => {
          const name = `metric ${index + 1}`
          return (
            <li key={metric.id} className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <CommitTextField label={`Label for ${name}`} value={metric.label} maxLength={MAX_LABEL} onCommit={(label) => run(updateMetric(widgetId, metric.id, { label }))} />
                </div>
                <button
                  type="button"
                  onClick={() => run(removeMetric(widgetId, metric.id))}
                  aria-label={`Remove ${name}`}
                  className="mb-1 rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
              <NumberField label={`Value for ${name}`} value={metric.value} onChange={(value) => run(updateMetric(widgetId, metric.id, { value }))} />
              <MoveButtons adapter={workspaceAdapter} itemId={metric.id} containerId={listContainerId('analytics', widgetId)} otherContainers={[]} subject={name} />
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        disabled={props.metrics.length >= MAX_LIST_ITEMS}
        onClick={() => run(addMetric(widgetId, newId('metric'), 'New metric', 0))}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add metric
      </button>
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>}
    </fieldset>
  )
}
