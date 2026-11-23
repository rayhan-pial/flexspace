import type { AnalyticsProps } from '../../domain/workspace/types'
import type { WidgetRenderProps } from '../types'
import { barPercent, formatValue } from './bars'

/**
 * Key numbers with a lightweight CSS bar for each, scaled to the largest value in the widget.
 * Long labels are truncated (the full text is in the tooltip) and the list scrolls inside the card.
 * No chart library and no network data: it is plain markup.
 */
export default function AnalyticsWidget({ title, props, mode }: WidgetRenderProps<AnalyticsProps>) {
  if (props.metrics.length === 0) {
    return (
      <p className="text-sm opacity-70">
        {mode === 'edit' ? 'No metrics yet. Select this widget and add some in Properties.' : 'No metrics yet.'}
      </p>
    )
  }

  const max = props.metrics.reduce((largest, metric) => Math.max(largest, metric.value), 0)

  return (
    <ul aria-label={`${title || 'Analytics'} metrics`} className="h-full min-h-0 space-y-3 overflow-y-auto">
      {props.metrics.map((metric) => (
        <li key={metric.id} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span title={metric.label} className="min-w-0 truncate text-sm">{metric.label}</span>
            <span className="shrink-0 text-lg font-semibold tabular-nums">{formatValue(metric.value)}</span>
          </div>
          <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-black/10">
            <div data-bar className="h-full rounded-full bg-[var(--fs-primary,#6366f1)]" style={{ width: `${barPercent(metric.value, max)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
