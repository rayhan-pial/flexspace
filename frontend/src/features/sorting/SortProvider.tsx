import { Accessibility } from '@dnd-kit/dom'
import { DragDropProvider } from '@dnd-kit/react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../editor/editorStore'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import type { Bounds, Preview, SourceFacts } from './resolveDrop'
import { dragFacts, hoverPreview, pointInside, previewPlacement, QUIET_IGNORES, resolveDrop } from './resolveDrop'
import * as say from './announce'
import { containerLabelOf, itemLabelOf } from './announce'
import { SortContext } from './sortContext'
import type { SortAdapter } from './types'

// dnd-kit's own announcements name items by id; this provider speaks through its own live region instead.
const SILENT = { dragstart: () => undefined, dragend: () => undefined }

/**
 * The single dnd-kit provider for semantic sorting. While a drag runs it keeps a transient preview
 * of the affected containers (React renders from it, so the DOM is never moved behind React's
 * back); a drop turns the preview into exactly one adapter move, and Escape, an outside drop or an
 * incompatible target simply discard it. A Save is refused while a drag is running.
 */
export default function SortProvider({ adapter, children }: { adapter: SortAdapter; children: ReactNode }) {
  const beginGesture = useEditorStore((s) => s.beginGesture)
  const endGesture = useEditorStore((s) => s.endGesture)
  const [preview, setPreview] = useState<Preview | null>(null)
  const previewRef = useRef<Preview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Spoken status for screen readers; the default announcements would read out internal ids.
  const [status, setStatus] = useState('')
  const spokenLabel = useRef('item')
  const owning = useRef(false)
  // Where the dragged item came from. Read once at drag start: React re-renders the item inside its
  // new container as the preview moves, which changes the data dnd-kit reports for it afterwards.
  const origin = useRef<SourceFacts | null>(null)
  // The containers' rectangles when the drag began. The preview re-lays the page out (an emptied
  // group collapses, a filled one grows), so "is the pointer over a container?" is judged against
  // where they were, not where the preview moved them.
  const startBounds = useRef<Bounds[]>([])

  const showPreview = (next: Preview | null) => {
    previewRef.current = next
    setPreview(next)
  }
  const finishDrag = () => {
    if (owning.current) endGesture()
    owning.current = false
    showPreview(null)
  }

  // A drag cannot outlive Edit mode (or the provider): release the drag state so Save is not blocked.
  const editing = useEffectiveMode() === 'edit'
  useEffect(() => {
    if (!editing && owning.current) {
      endGesture()
      owning.current = false
      previewRef.current = null
      setPreview(null)
    }
  }, [editing, endGesture])
  useEffect(
    () => () => {
      if (owning.current) endGesture()
    },
    [endGesture],
  )

  return (
    <SortContext.Provider value={{ adapter, preview }}>
      <DragDropProvider
        plugins={(defaults) => defaults.map((plugin) => (plugin === Accessibility ? Accessibility.configure({ announcements: SILENT }) : plugin))}
        onDragStart={(event) => {
          origin.current = dragFacts(event.operation.source, null).source
          // Only containers this item could actually be dropped into count as "somewhere to drop":
          // ending over another widget's metrics or over a full list is dropping outside, not on a target.
          const dragged = origin.current
          startBounds.current = [...document.querySelectorAll('[data-container-id]')]
            .filter((el) => !dragged || adapter.canMove({ itemId: dragged.id, fromContainerId: dragged.containerId, toContainerId: el.getAttribute('data-container-id') ?? '', toIndex: 0 }) === null)
            .map((el) => {
            const { left, right, top, bottom } = el.getBoundingClientRect()
            return { left, right, top, bottom }
          })
          spokenLabel.current = itemLabelOf(event.operation.source)
          setStatus(say.pickedUp(spokenLabel.current))
          owning.current = beginGesture('sort')
          showPreview(null)
          setMessage(null)
        }}
        onDragOver={(event) => {
          const { source: current, target } = dragFacts(event.operation.source, event.operation.target)
          const source = current && origin.current?.id === current.id ? origin.current : current
          const next = hoverPreview(previewRef.current, source, target, adapter)
          if (next !== previewRef.current) {
            showPreview(next)
            const placed = source ? previewPlacement(next, source.id) : null
            if (placed && next) setStatus(say.movedTo(spokenLabel.current, placed.index, next[placed.containerId]?.length ?? 0, containerLabelOf(placed.containerId)))
          }
        }}
        onDragEnd={(event) => {
          const { source: current, target } = dragFacts(event.operation.source, event.operation.target)
          const source = current && origin.current?.id === current.id ? origin.current : current
          const placement = source ? previewPlacement(previewRef.current, source.id) : null
          // A target only counts if its container would accept the item (another calendar reports an
          // agenda entry as a target too, because the types match). The target alone is also unreliable
          // at the very end (the item was just re-rendered into its new container), so otherwise
          // "outside" is decided by the pointer against the start-of-drag bounds.
          const targetAccepts =
            target !== null && source !== null && (target.containerId === source.containerId || adapter.canMove({ itemId: source.id, fromContainerId: source.containerId, toContainerId: target.containerId, toIndex: 0 }) === null)
          const overTarget = targetAccepts || pointInside(event.operation.position?.current, startBounds.current)
          const finalPreview = previewRef.current
          origin.current = null
          finishDrag()

          const decision = resolveDrop({ canceled: event.canceled, source, overTarget, placement }, adapter)
          const label = spokenLabel.current
          if ('request' in decision) {
            const outcome = adapter.commitMove(decision.request)
            if (outcome.status === 'rejected') setMessage(outcome.error)
            else {
              const { toContainerId, toIndex } = decision.request
              setStatus(say.droppedAt(label, toIndex, finalPreview?.[toContainerId]?.length ?? adapter.readItems(toContainerId)?.length ?? 0, containerLabelOf(toContainerId)))
            }
          } else if (!QUIET_IGNORES.includes(decision.ignore)) {
            setMessage(decision.ignore)
          } else {
            setStatus(decision.ignore === 'canceled' ? say.cancelled(label) : decision.ignore === 'dropped outside' ? say.droppedOutside(label) : say.droppedUnchanged(label))
          }
        }}
      >
        {children}
      </DragDropProvider>
      <p role="status" aria-live="assertive" aria-atomic="true" aria-label="Sorting status" className="sr-only">
        {status}
      </p>
      {message && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">
          {message}
        </p>
      )}
    </SortContext.Provider>
  )
}
