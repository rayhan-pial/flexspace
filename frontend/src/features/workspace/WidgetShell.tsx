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
  children: ReactNode
}

/**
 * Common widget chrome: title, appearance and (in Edit) selection. Drag/resize handles join in
 * FS-015. Clicking anywhere in the card (including its own controls) selects it; Enter/Space
 * select only when the card itself has focus, so typing inside a widget never re-selects.
 */
export default function WidgetShell({ widgetId, title, mode, selected, appearance, onSelect, children }: Props) {
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
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-[var(--fs-surface,#ffffff)] p-4 shadow-sm ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        editing && selected ? 'ring-2 ring-indigo-500' : 'ring-slate-200'
      }`}
    >
      <h3 id={headingId} className="mb-2 shrink-0 text-sm font-semibold tracking-wide">{title}</h3>
      <div className="min-h-0 flex-1">{children}</div>
    </article>
  )
}
