import { DragDropProvider } from '@dnd-kit/react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../editor/editorStore'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import type { Bounds, Preview, SourceFacts } from './resolveDrop'
import { dragFacts, hoverPreview, pointInside, previewPlacement, QUIET_IGNORES, resolveDrop } from './resolveDrop'
import { SortContext } from './sortContext'
import type { SortAdapter } from './types'

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
        onDragStart={(event) => {
          origin.current = dragFacts(event.operation.source, null).source
          startBounds.current = [...document.querySelectorAll('[data-container-id]')].map((el) => {
            const { left, right, top, bottom } = el.getBoundingClientRect()
            return { left, right, top, bottom }
          })
          owning.current = beginGesture('sort')
          showPreview(null)
          setMessage(null)
        }}
        onDragOver={(event) => {
          const { source: current, target } = dragFacts(event.operation.source, event.operation.target)
          const source = current && origin.current?.id === current.id ? origin.current : current
          const next = hoverPreview(previewRef.current, source, target, adapter)
          if (next !== previewRef.current) showPreview(next)
        }}
        onDragEnd={(event) => {
          const { source: current, target } = dragFacts(event.operation.source, event.operation.target)
          const source = current && origin.current?.id === current.id ? origin.current : current
          const placement = source ? previewPlacement(previewRef.current, source.id) : null
          // The target alone is unreliable at the very end (the item was just re-rendered into its
          // new container), so "outside" is decided by the pointer against the start-of-drag bounds.
          const overTarget = target !== null || pointInside(event.operation.position?.current, startBounds.current)
          origin.current = null
          finishDrag()

          const decision = resolveDrop({ canceled: event.canceled, source, overTarget, placement }, adapter)
          if ('request' in decision) {
            const outcome = adapter.commitMove(decision.request)
            if (outcome.status === 'rejected') setMessage(outcome.error)
          } else if (!QUIET_IGNORES.includes(decision.ignore)) {
            setMessage(decision.ignore)
          }
        }}
      >
        {children}
      </DragDropProvider>
      {message && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">
          {message}
        </p>
      )}
    </SortContext.Provider>
  )
}
