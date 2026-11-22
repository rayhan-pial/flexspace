import type { CSSProperties } from 'react'
import { useId } from 'react'
import type { GridRect, Section } from '../../domain/workspace/types'
import WidgetRenderer from './WidgetRenderer'

/**
 * Renders one section with the adapter for its kind. Hidden widgets are skipped (they stay in the
 * draft). Grid placement comes from the saved layout; below 1024 px the same widgets simply
 * stack in semantic (array) order, so the narrow layout is derived and never written to JSON.
 */
export default function SectionView({ section }: { section: Section }) {
  const headingId = useId()
  const visible = section.widgets.filter((widget) => !widget.hidden)
  const rects = new Map<string, GridRect>((section.layout ?? []).map((rect) => [rect.i, rect]))

  return (
    <section data-section-id={section.id} aria-labelledby={headingId} tabIndex={-1} className="scroll-mt-4 focus:outline-none">
      <h2 id={headingId} className="mb-3 text-lg font-semibold tracking-tight text-slate-900">
        {section.title || 'Untitled section'}
      </h2>

      {visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          This section has no visible widgets yet.
        </p>
      )}

      {visible.length > 0 && section.kind === 'stack' && (
        <div className="flex flex-col gap-4">
          {visible.map((widget) => (
            <div key={widget.id} className="min-w-0">
              <WidgetRenderer widget={widget} />
            </div>
          ))}
        </div>
      )}

      {visible.length > 0 && section.kind === 'grid' && (
        <div className="fs-grid">
          {visible.map((widget) => {
            const rect = rects.get(widget.id)
            const style = rect
              ? ({ '--col': rect.x + 1, '--span': rect.w, '--row': rect.y + 1, '--rows': rect.h } as CSSProperties)
              : undefined
            return (
              <div key={widget.id} className="fs-grid-item min-w-0" style={style}>
                <WidgetRenderer widget={widget} />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
