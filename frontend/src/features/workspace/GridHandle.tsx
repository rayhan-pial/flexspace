import { GripVertical } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useId, useState } from 'react'
import { nudgeWidget } from '../../domain/workspace/grid'
import type { RectChange } from '../../domain/workspace/grid'
import { useEditorStore } from '../editor/editorStore'

/** Class the grid adapter hands to React Grid Layout as the only element that starts a drag. */
export const GRID_HANDLE_CLASS = 'fs-grid-handle'

const KEYS: Record<string, [dx: number, dy: number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/**
 * The widget's grid handle. Dragging it (pointer) moves the widget through React Grid Layout; with
 * keyboard focus, arrow keys move by one cell and Shift + arrows resize by one cell. Both end up as
 * the same domain commands, and a refused change is announced rather than silently ignored.
 */
export default function GridHandle({ widgetId, title }: { widgetId: string; title: string }) {
  const apply = useEditorStore((s) => s.apply)
  const hintId = useId()
  const [message, setMessage] = useState<string | null>(null)

  function onKeyDown(event: KeyboardEvent) {
    const key = KEYS[event.key]
    if (!key) return
    event.preventDefault()
    const [x, y] = key
    const change: RectChange = event.shiftKey ? { dw: x, dh: y } : { dx: x, dy: y }
    const outcome = apply(nudgeWidget(widgetId, change))
    setMessage(outcome.status === 'rejected' ? outcome.error : null)
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <span
        role="button"
        tabIndex={0}
        aria-label={`Move or resize ${title}`}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        className={`${GRID_HANDLE_CLASS} ui-focus inline-flex min-h-6 min-w-6 cursor-grab touch-none items-center justify-center rounded p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11`}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </span>
      <span id={hintId} className="sr-only">Drag to move. Arrow keys move one cell; Shift with arrow keys resizes.</span>
      {message && <span role="alert" className="text-xs font-medium text-red-700">{message}</span>}
    </span>
  )
}
