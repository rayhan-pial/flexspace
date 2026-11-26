import type { ReactNode } from 'react'

/**
 * Safe stand-ins. They show only the widget's type (a bounded string, rendered as text) and never
 * its props, so unrecognised data can neither break the page nor inject anything. The underlying
 * data stays in the draft and is saved back unchanged.
 */

export function UnsupportedWidget({ widgetId, type, handle, dragRef }: { widgetId: string; type: string; handle?: ReactNode; dragRef?: (element: Element | null) => void }) {
  return (
    <article
      ref={dragRef}
      role="article"
      data-widget-id={widgetId}
      data-unsupported="true"
      className="flex h-full max-h-48 min-h-0 flex-col overflow-hidden rounded-2xl fs-rule border border-dashed bg-[var(--fs-surface,#f8fafc)] p-4"
    >
      <div className="flex items-center gap-1">
        {handle}
        <h3 className="text-sm font-semibold">Unsupported widget</h3>
      </div>
      <p className="mt-1 break-words text-sm">
        This version of FlexSpace does not know the widget type{' '}
        <code className="fs-track rounded px-1 py-0.5 text-xs">{type}</code>. Its data is kept and will be saved unchanged.
      </p>
    </article>
  )
}

export function InvalidWidgetBody() {
  return <p className="text-sm font-medium text-red-700">This widget's saved data is not valid, so it cannot be shown.</p>
}
