import type { KeyboardEvent, ReactNode } from 'react'
import { useId } from 'react'
import type { WidgetMode } from '../../widgets/types'
import { safeAppearanceStyle } from './appearance'

interface Props {
  widgetId: string
  title: string
  mode: WidgetMode
  selected: boolean
  /** Validated appearance of a known widget; pass `{}` for unknown types (their data is opaque). */
  appearance: Record<string, unknown>
  onSelect: () => void
  /** Grid move/resize handle, shown in Edit on grid sections only. */
  handle?: ReactNode
  /** Code-owned icon for the widget type (decorative), shown before the title. */
  icon?: ReactNode
  children: ReactNode
}

/**
 * Common widget chrome: title, appearance and (in Edit) selection. Drag/resize handles join in
 * FS-015. Clicking anywhere in the card (including its own controls) selects it; Enter/Space
 * select only when the card itself has focus, so typing inside a widget never re-selects.
 */
export default function WidgetShell({ widgetId, title, mode, selected, appearance, onSelect, handle, icon, children }: Props) {
  const headingId = useId()
  const editing = mode === 'edit'

  function onKeyDown(event: KeyboardEvent) {
    if (editing && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onSelect()
    }
  }

  return (
    <article
      aria-labelledby={headingId}
      data-widget-id={widgetId}
      data-selected={editing && selected ? 'true' : undefined}
      tabIndex={editing ? 0 : undefined}
      onClick={editing ? onSelect : undefined}
      onKeyDown={onKeyDown}
      style={safeAppearanceStyle(appearance)}
      className={`ui-focus flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-[var(--fs-surface,#ffffff)] p-4 ring-1 transition-shadow ${
        editing && selected ? 'shadow-md ring-2 ring-ui-primary' : editing ? 'shadow-sm ring-black/10 hover:ring-ui-control' : 'shadow-sm ring-black/10'
      }`}
    >
      <div className="mb-2 flex shrink-0 items-center gap-1.5">
        {editing && handle}
        {icon && <span aria-hidden="true" className="flex shrink-0 opacity-70 [&_svg]:size-4">{icon}</span>}
        <h3 id={headingId} className="min-w-0 truncate text-sm font-semibold tracking-wide">{title}</h3>
        {editing && selected && (
          // A word as well as a colour, so the selection is not conveyed by colour alone.
          <span data-selected-label className="ml-auto shrink-0 rounded-full bg-ui-primary px-2 py-0.5 text-[11px] font-medium leading-none text-white">Selected</span>
        )}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </article>
  )
}
