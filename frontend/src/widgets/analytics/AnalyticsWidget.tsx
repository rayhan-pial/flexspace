import type { ReactNode } from 'react'
import type { AnalyticsProps, Metric } from '../../domain/workspace/types'
import SortHandle from '../../features/sorting/SortHandle'
import SortableSection from '../../features/sorting/SortableSection'
import { useOptionalSortContext } from '../../features/sorting/sortContext'
import { listContainerId, METRIC_ITEM_TYPE } from '../../features/sorting/workspaceAdapter'
import type { WidgetRenderProps } from '../types'
import { barPercent, formatValue } from './bars'

function MetricCard({ metric, max, handle }: { metric: Metric; max: number; handle?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1">
          {handle}
          <span title={metric.label} className="min-w-0 truncate text-sm">{metric.label}</span>
        </span>
        <span className="shrink-0 text-lg font-semibold tabular-nums">{formatValue(metric.value)}</span>
      </div>
      <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-black/10">
        <div data-bar className="h-full rounded-full bg-[var(--fs-primary,#6366f1)]" style={{ width: `${barPercent(metric.value, max)}%` }} />
      </div>
    </div>
  )
}

/**
 * Key numbers with a lightweight CSS bar for each, scaled to the largest value in the widget.
 * Long labels are truncated (the full text is in the tooltip) and the list scrolls inside the card.
 * No chart library and no network data: it is plain markup. The cards follow the saved array order;
 * in Edit they can be reordered by their grip, within this widget only (a metric never leaves it).
 */
export default function AnalyticsWidget({ widgetId, title, props, mode }: WidgetRenderProps<AnalyticsProps>) {
  const hasSorting = useOptionalSortContext() !== null
  const max = props.metrics.reduce((largest, metric) => Math.max(largest, metric.value), 0)

  if (mode === 'edit' && hasSorting) {
    return (
      <SortableSection
        containerId={listContainerId('analytics', widgetId)}
        itemType={METRIC_ITEM_TYPE}
        items={props.metrics.map((metric) => metric.id)}
        orientation="vertical"
        label={`${title || 'Analytics'} metrics`}
        emptyLabel="No metrics yet. Select this widget and add some in Properties."
        className="h-full min-h-0 gap-3 overflow-y-auto"
        renderItem={(id, { handleRef }) => {
          const metric = props.metrics.find((entry) => entry.id === id)
          return metric ? <MetricCard metric={metric} max={max} handle={<SortHandle handleRef={handleRef} label={`Reorder metric ${metric.label}`} />} /> : null
        }}
      />
    )
  }

  if (props.metrics.length === 0) {
    return (
      <p className="text-sm opacity-70">
        {mode === 'edit' ? 'No metrics yet. Select this widget and add some in Properties.' : 'No metrics yet.'}
      </p>
    )
  }

  return (
    <ul aria-label={`${title || 'Analytics'} metrics`} className="h-full min-h-0 space-y-3 overflow-y-auto">
      {props.metrics.map((metric) => (
        <li key={metric.id} className="min-w-0">
          <MetricCard metric={metric} max={max} />
        </li>
      ))}
    </ul>
  )
}
