import type { ReactNode } from 'react'
import type { Section, Widget } from '../../domain/workspace/types'
import SortHandle from '../sorting/SortHandle'
import SortableSection from '../sorting/SortableSection'
import { useOptionalSortContext } from '../sorting/sortContext'
import { OUTLINE_ITEM_TYPE, outlineContainerId } from '../sorting/workspaceAdapter'
import { isKnownWidgetType, widgetTypeLabel } from '../workspace/registry'
import { useEditorStore } from './editorStore'

const itemClass = (selected: boolean) =>
  `flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
    selected ? 'bg-indigo-50 font-medium text-indigo-900 ring-1 ring-indigo-200' : 'text-slate-700 hover:bg-slate-100'
  }`

function widgetLabel(widget: Widget): string {
  if (widget.title) return widget.title
  return isKnownWidgetType(widget.type) ? widgetTypeLabel(widget.type) : `Unsupported: ${widget.type}`
}

function scrollWidgetIntoView(widgetId: string) {
  document.querySelector(`[data-widget-id="${widgetId}"]`)?.scrollIntoView?.({ block: 'nearest' })
}

/**
 * Every section and widget of the draft, including hidden ones (they are discoverable here even
 * though the canvas skips them). Selecting here selects on the canvas and vice versa because both
 * read and write the one `selection` in the editor store. The widgets of a grid section are a
 * sortable list: reordering them here is the semantic order of the dashboard, and the visible
 * rectangles are repacked in that order (the canvas follows at once). Moving a widget on the
 * canvas does the reverse: it re-sorts this list.
 */
export default function ComponentOutline() {
  const draft = useEditorStore((s) => s.draftConfig)
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const sorting = useOptionalSortContext() !== null
  if (!draft) return null

  if (draft.sections.length === 0) {
    return <p className="text-sm text-slate-500">This workspace has no sections yet.</p>
  }

  const isSelected = (kind: 'section' | 'widget', id: string) => selection?.kind === kind && selection.id === id

  const widgetButton = (widget: Widget, handle?: ReactNode) => (
    <div className="flex items-center gap-1">
      {handle}
      <button
        type="button"
        aria-current={isSelected('widget', widget.id) ? 'true' : undefined}
        onClick={() => {
          select({ kind: 'widget', id: widget.id })
          scrollWidgetIntoView(widget.id)
        }}
        className={itemClass(isSelected('widget', widget.id))}
      >
        <span className="truncate">{widgetLabel(widget)}</span>
        {widget.hidden && <span className="shrink-0 text-xs text-slate-500">hidden</span>}
      </button>
    </div>
  )

  const widgetList = (section: Section) => {
    if (section.kind === 'grid' && sorting) {
      return (
        <SortableSection
          containerId={outlineContainerId(section.id)}
          itemType={OUTLINE_ITEM_TYPE}
          items={section.widgets.map((widget) => widget.id)}
          orientation="vertical"
          label={`${section.title || 'Untitled section'} widgets`}
          emptyLabel="No widgets"
          className="ml-3 gap-0 border-l border-slate-200 pl-2"
          renderItem={(id, { handleRef }) => {
            const widget = section.widgets.find((w) => w.id === id)
            return widget ? widgetButton(widget, <SortHandle handleRef={handleRef} label={`Reorder ${widgetLabel(widget)} in outline`} />) : null
          }}
        />
      )
    }
    if (section.widgets.length === 0) return <p className="ml-4 py-1 text-xs text-slate-500">No widgets</p>
    return (
      <ul className="ml-3 border-l border-slate-200 pl-2">
        {section.widgets.map((widget) => (
          <li key={widget.id}>{widgetButton(widget)}</li>
        ))}
      </ul>
    )
  }

  const renderSection = (section: Section) => (
    <li key={section.id}>
      <button
        type="button"
        aria-current={isSelected('section', section.id) ? 'true' : undefined}
        onClick={() => select({ kind: 'section', id: section.id })}
        className={itemClass(isSelected('section', section.id))}
      >
        <span className="truncate font-medium">{section.title || 'Untitled section'}</span>
        {section.hidden && <span className="shrink-0 text-xs text-slate-500">hidden</span>}
      </button>
      {widgetList(section)}
    </li>
  )

  return <ul aria-label="Components" className="space-y-1">{draft.sections.map(renderSection)}</ul>
}
