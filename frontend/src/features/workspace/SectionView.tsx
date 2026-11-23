import { useId } from 'react'
import type { Section } from '../../domain/workspace/types'
import GridSection from './GridSection'
import WidgetRenderer from './WidgetRenderer'

/**
 * Renders one section with the adapter for its kind. Hidden widgets are skipped (they stay in the
 * draft). Grid placement comes from the saved layout; below 1024 px the same widgets simply
 * stack in semantic (array) order, so the narrow layout is derived and never written to JSON.
 */
export default function SectionView({ section }: { section: Section }) {
  const headingId = useId()
  const visible = section.widgets.filter((widget) => !widget.hidden)

  return (
    <section data-section-id={section.id} aria-labelledby={headingId} tabIndex={-1} className="scroll-mt-4 focus:outline-none">
      <h2 id={headingId} className="mb-3 text-lg font-semibold tracking-tight">
        {section.title || 'Untitled section'}
      </h2>

      {visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {section.widgets.length === 0
            ? 'This section is empty. Add a component from the Library in Edit mode.'
            : 'All widgets in this section are hidden. Show them from the outline in Edit mode.'}
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

      {visible.length > 0 && section.kind === 'grid' && <GridSection section={section} widgets={visible} />}
    </section>
  )
}
