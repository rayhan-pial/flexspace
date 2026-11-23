import type { ReactNode } from 'react'

/**
 * Safe stand-ins. They show only the widget's type (a bounded string, rendered as text) and never
 * its props, so unrecognised data can neither break the page nor inject anything. The underlying
 * data stays in the draft and is saved back unchanged.
 */

export function UnsupportedWidget({ widgetId, type, handle }: { widgetId: string; type: string; handle?: ReactNode }) {
  return (
    <article
      data-widget-id={widgetId}
      data-unsupported="true"
      className="flex h-full max-h-48 min-h-0 flex-col overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-slate-600"
    >
      <div className="flex items-center gap-1">
        {handle}
        <h3 className="text-sm font-semibold text-slate-700">Unsupported widget</h3>
      </div>
      <p className="mt-1 break-words text-sm">
        This version of FlexSpace does not know the widget type{' '}
        <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">{type}</code>. Its data is kept and will be saved unchanged.
      </p>
    </article>
  )
}

/** A type the schema knows whose renderer arrives in a later task. */
export function PendingWidgetBody({ label }: { label: string }) {
  return (
    <p className="text-sm text-slate-500">
      The {label.toLowerCase()} widget is not available in this build yet. Its content is kept and saved unchanged.
    </p>
  )
}

export function InvalidWidgetBody() {
  return <p className="text-sm text-rose-700">This widget's saved data is not valid, so it cannot be shown.</p>
}
