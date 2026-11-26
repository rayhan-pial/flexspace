import type { ReactNode } from 'react'
import { useId } from 'react'
import type { Section } from '../../domain/workspace/types'
import { useEditorStore } from '../editor/editorStore'
import { useInspectorView } from '../editor/inspectorView'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import SortableSection from '../sorting/SortableSection'
import { stackContainerId, WIDGET_ITEM_TYPE } from '../sorting/workspaceAdapter'
import GridSection from './GridSection'
import WidgetRenderer from './WidgetRenderer'

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
  const { openLibrary, canAddFromCanvas } = useInspectorView()
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
    <section data-section-id={section.id} aria-labelledby={headingId} tabIndex={-1} className="scroll-mt-[calc(var(--toolbar-h,0px)+1rem)] focus:outline-none">
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
          pointerOnly
          renderItem={(id, { handleRef }) => {
            const widget = findCard(id)
            if (!widget) return null
            return (
              <div className="min-w-0">
                <WidgetRenderer widget={widget} dragRef={handleRef} />
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

      {editing && canAddFromCanvas && (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => openLibrary(section.id)}
          className="ui-focus fs-rule mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm font-medium opacity-70 transition-opacity hover:opacity-100 [@media(pointer:coarse)]:min-h-11"
        >
          <span aria-hidden="true">+</span> Add component to {section.title || 'Untitled section'}
        </button>
      )}
    </section>
  )
}
