import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactGridLayout, { getCompactor, useContainerWidth } from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import { GRID_COLUMNS } from '../../domain/workspace/constants'
import { commitGridLayout } from '../../domain/workspace/grid'
import { minSizeFor } from '../../domain/workspace/placement'
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
// No automatic compaction or pushing while dragging: the view always equals the saved layout.
// The final layout is validated and compacted once, in `commitGridLayout`.
const compactor = getCompactor(null, false, true)

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
  const owning = useRef(false)

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

  function onStart() {
    owning.current = beginGesture('grid')
  }
  function onStop(final: Layout) {
    const outcome = apply(commitGridLayout(section.id, final.map(toRect)))
    if (owning.current) endGesture()
    owning.current = false
    // A refused or unchanged result must visibly snap back to the saved layout.
    if (outcome.status !== 'applied') setResetKey((key) => key + 1)
  }

  const live = editing && mounted && width > 0

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
          onDragStart={onStart}
          onDragStop={(next) => onStop(next)}
          onResizeStart={onStart}
          onResizeStop={(next) => onStop(next)}
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
