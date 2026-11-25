import type { ReactNode } from 'react'
import { useId } from 'react'
import type { Section } from '../../domain/workspace/types'
import { useEditorStore } from '../editor/editorStore'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import SortHandle from '../sorting/SortHandle'
import SortableSection from '../sorting/SortableSection'
import { stackContainerId, WIDGET_ITEM_TYPE } from '../sorting/workspaceAdapter'
import GridSection from './GridSection'
import WidgetRenderer from './WidgetRenderer'
import { isKnownWidgetType, widgetTypeLabel } from './registry'

/**
 * Renders one section with the adapter for its kind. Hidden widgets are skipped (they stay in the
 * draft). Grid placement comes from the saved layout; below 1024 px the same widgets simply
 * stack in semantic (array) order, so the narrow layout is derived and never written to JSON.
 * In Edit a stack section's cards are a sortable container (an empty one is a drop target), and
 * `handle` is the grip with which the whole section is reordered.
 */
export default function SectionView({ section, handle }: { section: Section; handle?: ReactNode }) {
  const headingId = useId()
  const editing = useEffectiveMode() === 'edit'
  const visible = section.widgets.filter((widget) => !widget.hidden)
  const emptyMessage =
    section.widgets.length === 0
      ? 'This section is empty. Add a component from the Library in Edit mode.'
      : 'All widgets in this section are hidden. Show them from the outline in Edit mode.'
  const sortableCards = section.kind === 'stack' && editing
  // A card being dragged in from another section is previewed here before it is committed, so cards
  // are resolved from the whole draft, not only from this section.
  const draft = useEditorStore((s) => s.draftConfig)
  const findCard = (id: string) => draft?.sections.flatMap((s) => s.widgets).find((widget) => widget.id === id)

  return (
    <section data-section-id={section.id} aria-labelledby={headingId} tabIndex={-1} className="scroll-mt-4 focus:outline-none">
      <div className="mb-3 flex items-center gap-2">
        {editing && handle}
        <h2 id={headingId} className="min-w-0 text-lg font-semibold tracking-tight">
          {section.title || 'Untitled section'}
        </h2>
      </div>

      {visible.length === 0 && !sortableCards && (
        <p className="fs-rule rounded-xl border border-dashed p-6 text-center text-sm opacity-75">{emptyMessage}</p>
      )}

      {sortableCards && (
        <SortableSection
          containerId={stackContainerId(section.id)}
          itemType={WIDGET_ITEM_TYPE}
          items={visible.map((widget) => widget.id)}
          orientation="vertical"
          label={`${section.title || 'Untitled section'} cards`}
          emptyLabel={`${emptyMessage} You can also drag a card here.`}
          className="gap-4"
          renderItem={(id, { handleRef }) => {
            const widget = findCard(id)
            if (!widget) return null
            const name = widget.title || (isKnownWidgetType(widget.type) ? widgetTypeLabel(widget.type) : 'unsupported widget')
            return (
              <div className="min-w-0">
                <WidgetRenderer widget={widget} sortHandle={<SortHandle handleRef={handleRef} label={`Reorder card ${name}`} />} />
              </div>
            )
          }}
        />
      )}

      {visible.length > 0 && section.kind === 'stack' && !sortableCards && (
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
