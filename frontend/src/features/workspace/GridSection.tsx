import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout'
import type { Compactor, Layout } from 'react-grid-layout'
import { GRID_COLUMNS } from '../../domain/workspace/constants'
import { commitGridLayout } from '../../domain/workspace/grid'
import { minSizeFor, reflowAfterGesture } from '../../domain/workspace/placement'
import type { GridRect, Section, Widget } from '../../domain/workspace/types'
import { useEditorStore } from '../editor/editorStore'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import { GRID_HANDLE_CLASS } from './GridHandle'
import WidgetRenderer from './WidgetRenderer'

// Units shared with the CSS fallback in index.css (.fs-grid): 12 columns, 32px rows, 16px gaps.
const ROW_HEIGHT = 32
const GAP = 16
// Nothing inside a widget may start a grid drag; only the handle does.
const CANCEL = 'input, textarea, select, button, a, [data-no-drag]'

/**
 * React Grid Layout asks its compactor to arrange the layout on mount, on every container resize
 * and on every drag frame. While nothing is being dragged this one returns the layout unchanged, so
 * saved positions (including gaps) are drawn exactly as stored and opening a panel or resizing the
 * window can never move or save anything. During a drag or resize it applies the domain's reflow:
 * neighbours are pushed down out of the way and everything compacts upward, the very resolution
 * `commitGridLayout` receives, so the preview is the result. Items are cloned, never mutated.
 */
function createCompactor(movedId: { current: string | null }): Compactor {
  return {
    type: 'vertical',
    allowOverlap: false,
    preventCollision: false,
    compact(layout) {
      const moved = movedId.current
      if (!moved) return layout.map((item) => ({ ...item }))
      const resolved = new Map(reflowAfterGesture(layout.map(toRect), moved).map((rect) => [rect.i, rect]))
      return layout.map((item) => ({ ...item, ...resolved.get(item.i) }))
    },
  }
}

/** Where a pointer or touch event ended, if it carries coordinates. */
function pointOf(event: unknown): { x: number; y: number } | null {
  const e = event as { clientX?: number; clientY?: number; changedTouches?: ArrayLike<{ clientX: number; clientY: number }> } | undefined
  if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') return { x: e.clientX, y: e.clientY }
  const touch = e?.changedTouches?.[0]
  return touch ? { x: touch.clientX, y: touch.clientY } : null
}

const toRect = ({ i, x, y, w, h }: { i: string; x: number; y: number; w: number; h: number }): GridRect => ({ i, x, y, w, h })

/**
 * Desktop grid for one section. In Edit, once the container has been measured, React Grid Layout
 * handles pointer move/resize; otherwise (Preview, narrow screens, before measurement) the same
 * saved rectangles are drawn with plain CSS grid. Only gesture *stop* callbacks write to the
 * draft, as one command each; mounting, measurement and container-resize callbacks are ignored,
 * so opening a panel or resizing the window can never dirty the workspace.
 */
export default function GridSection({ section, widgets }: { section: Section; widgets: Widget[] }) {
  const editing = useEffectiveMode() === 'edit'
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true })
  const apply = useEditorStore((s) => s.apply)
  const beginGesture = useEditorStore((s) => s.beginGesture)
  const endGesture = useEditorStore((s) => s.endGesture)
  const [resetKey, setResetKey] = useState(0)
  const [gesturing, setGesturing] = useState(false)
  const owning = useRef(false)
  const movedId = useRef<string | null>(null)
  const compactor = useMemo(() => createCompactor(movedId), [])

  /** Abandon the gesture in progress: nothing is applied, and the section redraws from the draft. */
  function abandon() {
    movedId.current = null
    if (owning.current) endGesture()
    owning.current = false
    setGesturing(false)
    setResetKey((key) => key + 1)
  }

  // Escape cancels a drag or resize in progress without writing to the draft or its history.
  useEffect(() => {
    if (!gesturing) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') abandon()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesturing])

  // Leaving Edit (or unmounting) mid-gesture must not leave Save blocked.
  useEffect(
    () => () => {
      if (owning.current) endGesture()
    },
    [endGesture],
  )

  const rects = useMemo(() => new Map((section.layout ?? []).map((rect) => [rect.i, rect])), [section.layout])
  const layout = useMemo(
    () =>
      widgets.flatMap((widget) => {
        const rect = rects.get(widget.id)
        if (!rect) return []
        const [minW, minH] = minSizeFor(widget.type)
        return [{ ...rect, minW, minH, maxW: GRID_COLUMNS }]
      }),
    [widgets, rects],
  )

  function onStart(_layout: Layout, item: { i: string } | null) {
    owning.current = beginGesture('grid')
    movedId.current = item?.i ?? null
    setGesturing(true)
  }
  function onStop(final: Layout, event: unknown) {
    // Releasing outside the canvas (over the inspector, the rail, the toolbar) is a cancel, not a drop.
    const point = pointOf(event)
    const canvas = containerRef.current?.closest('#workspace-canvas')?.getBoundingClientRect()
    if (point && canvas && (point.x < canvas.left || point.x > canvas.right || point.y < canvas.top)) {
      abandon()
      return
    }
    const outcome = apply(commitGridLayout(section.id, final.map(toRect)))
    movedId.current = null
    setGesturing(false)
    if (owning.current) endGesture()
    owning.current = false
    // A refused or unchanged result must visibly snap back to the saved layout.
    if (outcome.status !== 'applied') setResetKey((key) => key + 1)
  }

  const live = editing && mounted && width > 0

  // Leaving Edit (or losing the measured width) mid-gesture abandons it: nothing is written and Save is not left blocked.
  useEffect(() => {
    if (live || !owning.current) return
    movedId.current = null
    owning.current = false
    endGesture()
    setGesturing(false)
  }, [live, endGesture])

  return (
    <div ref={containerRef}>
      {live ? (
        <ReactGridLayout
          key={resetKey}
          width={width}
          layout={layout}
          gridConfig={{ cols: GRID_COLUMNS, rowHeight: ROW_HEIGHT, margin: [GAP, GAP], containerPadding: [0, 0], maxRows: Infinity }}
          dragConfig={{ enabled: true, handle: `.${GRID_HANDLE_CLASS}`, cancel: CANCEL }}
          resizeConfig={{ enabled: true, handles: ['se'] }}
          compactor={compactor}
          onDragStart={(l, old) => onStart(l, old)}
          onDragStop={(next, _old, _new, _ph, event) => onStop(next, event)}
          onResizeStart={(l, old) => onStart(l, old)}
          onResizeStop={(next, _old, _new, _ph, event) => onStop(next, event)}
        >
          {widgets.map((widget) => (
            <div key={widget.id} className="min-w-0">
              <WidgetRenderer widget={widget} inGrid />
            </div>
          ))}
        </ReactGridLayout>
      ) : (
        <div className="fs-grid">
          {widgets.map((widget) => {
            const rect = rects.get(widget.id)
            const style = rect
              ? ({ '--col': rect.x + 1, '--span': rect.w, '--row': rect.y + 1, '--rows': rect.h } as CSSProperties)
              : undefined
            return (
              <div key={widget.id} className="fs-grid-item min-w-0" style={style}>
                <WidgetRenderer widget={widget} inGrid />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
