import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import type { WorkspaceConfig } from '../../domain/workspace/types'
import { stubViewport } from '../../test/viewport'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import GridSection from './GridSection'

/*
 * jsdom cannot measure widths or run pointer gestures, so React Grid Layout is replaced by a stub
 * that exposes its callbacks as buttons. These tests prove what the adapter does with them; the
 * real library is exercised in a browser (see docs/tasks.md, FS-015).
 */
const measured = { width: 1000, mounted: true }
const rglProps: { current: Record<string, unknown> | null } = { current: null }
let rglMounts = 0

vi.mock('react-grid-layout', async () => {
  const React = await import('react')
  return {
    default: function MockGrid(props: Record<string, unknown> & { children: ReactNode }) {
      rglProps.current = props
      React.useEffect(() => {
        rglMounts += 1
      }, [])
      const call = (name: string, layout: unknown) => () => (props[name] as (l: unknown, item: unknown) => void)(layout, (layout as Array<{ i: string }>).find((r) => r.i === 'c'))
      const layout = props.layout as Array<{ i: string; x: number; y: number; w: number; h: number }>
      return (
        <div data-testid="rgl">
          {props.children}
          <button onClick={call('onDragStart', layout)}>drag start</button>
          <button onClick={call('onDragStop', layout.map((r) => (r.i === 'a' ? { ...r, x: 6 } : r.i === 'b' ? { ...r, x: 0, y: 8 } : r)))}>drag stop moved</button>
          <button onClick={call('onDragStop', layout)}>drag stop in place</button>
          <button onClick={call('onDragStop', layout.map((r) => (r.i === 'b' ? { ...r, x: 0, y: 0 } : r)))}>drag stop overlapping</button>
          <button onClick={call('onResizeStart', layout)}>resize start</button>
          <button onClick={call('onResizeStop', layout.map((r) => (r.i === 'c' ? { ...r, w: 8 } : r)))}>resize stop</button>
          <button onClick={() => (props.onLayoutChange as ((l: unknown) => void) | undefined)?.([])}>layout change</button>
        </div>
      )
    },
    useContainerWidth: () => ({ width: measured.width, mounted: measured.mounted, containerRef: { current: null } }),
  }
})

const base = {
  schemaVersion: 1,
  title: 'Grid',
  sections: [
    {
      id: 's1', kind: 'grid', title: 'Main',
      widgets: [
        { id: 'a', type: 'notes', title: 'A note', props: { body: 'a' } },
        { id: 'b', type: 'notes', title: 'B note', props: { body: 'b' } },
        { id: 'c', type: 'welcome', title: 'C card' },
      ],
      layout: [{ i: 'a', x: 0, y: 0, w: 6, h: 4 }, { i: 'b', x: 6, y: 0, w: 6, h: 4 }, { i: 'c', x: 0, y: 4, w: 6, h: 3 }],
    },
  ],
}

const editor = () => useEditorStore.getState()
let viewport: ReturnType<typeof stubViewport>

function load(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig(base)
  if (!parsed.ok) throw new Error(parsed.message)
  editor().load({ ownerId: 'u1', workspaceId: 'w1', revision: 1, config: parsed.config })
  return parsed.config
}

function Harness() {
  const draft = useEditorStore((s) => s.draftConfig)!
  const section = draft.sections[0]
  return <GridSection section={section} widgets={section.widgets.filter((w) => !w.hidden)} />
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  measured.width = 1000
  measured.mounted = true
  rglProps.current = null
  rglMounts = 0
  viewport = stubViewport(true)
  load()
})
afterEach(() => viewport.restore())

const layoutOf = () => editor().draftConfig!.sections[0].layout!
const click = (name: string) => userEvent.setup().click(screen.getByRole('button', { name }))

describe('React Grid Layout adapter', () => {
  it('uses the library in Edit once measured, with the grid units, the single handle and nested-control cancel', () => {
    render(<Harness />)
    expect(screen.getByTestId('rgl')).toBeInTheDocument()
    const props = rglProps.current as { width: number; gridConfig: Record<string, unknown>; dragConfig: Record<string, unknown>; resizeConfig: Record<string, unknown>; layout: Array<Record<string, number | string>> }
    expect(props.width).toBe(1000)
    expect(props.gridConfig).toMatchObject({ cols: 12, rowHeight: 32, margin: [16, 16] })
    expect(props.dragConfig).toMatchObject({ enabled: true })
    expect((props.dragConfig as { handle?: string }).handle).toBeUndefined() // the whole card is the grab area
    expect(String(props.dragConfig.cancel)).toContain('textarea')
    expect(props.resizeConfig).toMatchObject({ enabled: true })
    expect(props.layout.find((r) => r.i === 'c')).toMatchObject({ x: 0, y: 4, w: 6, h: 3, minW: 3, minH: 2 }) // welcome minimum
    expect(screen.getAllByRole('button', { name: /^Move or resize/ })).toHaveLength(3)
  })

  it('mounting, measuring and layout-change callbacks never write to the draft', async () => {
    render(<Harness />)
    const draft = editor().draftConfig
    await click('layout change')
    act(() => {
      measured.width = 700
    })
    expect(editor().draftConfig).toBe(draft)
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('the compactor changes nothing while idle, including gaps, and never mutates its input (UI-021)', () => {
    render(<Harness />)
    const { compactor } = rglProps.current as { compactor: { compact: (l: unknown[], cols: number) => Array<Record<string, number | string>>; allowOverlap: boolean; preventCollision: boolean } }
    const gappy = [{ i: 'a', x: 0, y: 5, w: 6, h: 4 }, { i: 'b', x: 6, y: 9, w: 6, h: 4 }]
    const frozen = JSON.stringify(gappy)
    const out = compactor.compact(gappy, 12)
    expect(out).toEqual(gappy)
    expect(out[0]).not.toBe(gappy[0])
    expect(JSON.stringify(gappy)).toBe(frozen)
    expect(compactor.allowOverlap).toBe(false)
    expect(compactor.preventCollision).toBe(false) // native pushing, not collision blocking
  })

  it('during a gesture the compactor pushes neighbours down and compacts, and the stop commits that same layout', async () => {
    render(<Harness />)
    await click('drag start') // the stub reports c as the moved item
    const { compactor } = rglProps.current as { compactor: { compact: (l: unknown[], cols: number) => Array<{ i: string; x: number; y: number; w: number; h: number }> } }
    const dragged = [{ i: 'a', x: 0, y: 0, w: 6, h: 4 }, { i: 'b', x: 6, y: 0, w: 6, h: 4 }, { i: 'c', x: 0, y: 0, w: 6, h: 3, minW: 3 }]
    const preview = compactor.compact(dragged, 12)
    expect(preview.find((r) => r.i === 'c')).toMatchObject({ x: 0, y: 0, w: 6, h: 3, minW: 3 }) // extra props survive
    expect(preview.find((r) => r.i === 'a')).toMatchObject({ x: 0, y: 3, w: 6, h: 4 })
    expect(preview.find((r) => r.i === 'b')).toMatchObject({ x: 6, y: 0 })
    const stop = (rglProps.current as { onDragStop: (l: unknown, ...rest: unknown[]) => void }).onDragStop
    act(() => stop(preview.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))))
    expect(layoutOf().find((r) => r.i === 'a')).toEqual({ i: 'a', x: 0, y: 3, w: 6, h: 4 })
    expect(layoutOf().find((r) => r.i === 'c')).toEqual({ i: 'c', x: 0, y: 0, w: 6, h: 3 })
    expect(editor().draftConfig!.sections[0].widgets.map((w) => w.id)).toEqual(['c', 'b', 'a'])
    expect(editor().history.past).toHaveLength(1) // one gesture, one Undo step
    editor().undo()
    expect(layoutOf()).toEqual(base.sections[0].layout)
    // after the gesture the compactor is idle again
    const idle = (rglProps.current as { compactor: { compact: (l: unknown[], cols: number) => unknown[] } }).compactor.compact(dragged, 12)
    expect(idle).toEqual(dragged)
  })

  it('Escape cancels a gesture in progress: no draft or history write, Save is unblocked and the grid redraws', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const draft = editor().draftConfig
    const mounts = rglMounts
    await click('drag start')
    expect(editor().interaction.gesture).toBe('grid')
    await user.keyboard('{Escape}')
    expect(editor().interaction.gesture).toBeNull()
    expect(editor().draftConfig).toBe(draft)
    expect(editor().history.past).toHaveLength(0)
    expect(rglMounts).toBeGreaterThan(mounts)
  })

  it('leaving Edit mid-gesture abandons it without writing or leaving Save blocked', async () => {
    render(<Harness />)
    const draft = editor().draftConfig
    await click('drag start')
    act(() => editor().setMode('preview'))
    expect(editor().interaction.gesture).toBeNull()
    expect(editor().draftConfig).toBe(draft)
  })

  it('a drag stop commits exactly one compacted command and syncs array order', async () => {
    render(<Harness />)
    const apply = vi.spyOn(editor(), 'apply')
    useEditorStore.setState({ apply })
    await click('drag stop moved')
    expect(apply).toHaveBeenCalledTimes(1)
    expect(layoutOf()).toEqual([
      { i: 'a', x: 6, y: 0, w: 6, h: 4 }, { i: 'b', x: 0, y: 3, w: 6, h: 4 }, { i: 'c', x: 0, y: 0, w: 6, h: 3 },
    ])
    expect(editor().draftConfig!.sections[0].widgets.map((w) => w.id)).toEqual(['c', 'a', 'b'])
    expect(selectIsDirty(editor())).toBe(true)
  })

  it('a resize stop commits once', async () => {
    render(<Harness />)
    await click('resize stop')
    expect(layoutOf().find((r) => r.i === 'c')).toEqual({ i: 'c', x: 0, y: 4, w: 8, h: 3 })
  })

  it('a gesture blocks Save while it runs and releases it when it stops', async () => {
    render(<Harness />)
    await click('drag start')
    expect(editor().interaction.gesture).toBe('grid')
    expect(editor().beginSave()).toBeNull()
    await click('drag stop in place')
    expect(editor().interaction.gesture).toBeNull()
  })

  it('dropping where it started is a no-op and snaps the grid back', async () => {
    render(<Harness />)
    const draft = editor().draftConfig
    await click('drag start')
    const mounts = rglMounts
    await click('drag stop in place')
    expect(editor().draftConfig).toBe(draft)
    expect(selectIsDirty(editor())).toBe(false)
    expect(rglMounts).toBe(mounts + 1) // remounted from the saved layout
  })

  it('an invalid result (overlap) is refused, leaves the draft alone and snaps back', async () => {
    render(<Harness />)
    const draft = editor().draftConfig
    await click('drag start')
    const mounts = rglMounts
    await click('drag stop overlapping')
    expect(editor().draftConfig).toBe(draft)
    expect(editor().interaction.gesture).toBeNull()
    expect(rglMounts).toBe(mounts + 1)
  })

  it('leaving Edit during a gesture does not leave Save blocked', async () => {
    const { unmount } = render(<Harness />)
    await click('resize start')
    expect(editor().interaction.gesture).toBe('grid')
    unmount()
    expect(editor().interaction.gesture).toBeNull()
  })

  it('falls back to the plain CSS grid in Preview, before measurement and with no width', () => {
    useEditorStore.getState().setMode('preview')
    const { unmount } = render(<Harness />)
    expect(screen.queryByTestId('rgl')).not.toBeInTheDocument()
    expect(document.querySelector('.fs-grid')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /^Move or resize/ })).not.toBeInTheDocument() // no handles in Preview
    unmount()

    useEditorStore.getState().setMode('edit')
    measured.mounted = false
    const second = render(<Harness />)
    expect(screen.queryByTestId('rgl')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Move or resize/ })).toHaveLength(3) // keyboard handles still work
    second.unmount()

    measured.mounted = true
    measured.width = 0
    render(<Harness />)
    expect(screen.queryByTestId('rgl')).not.toBeInTheDocument()
  })

  it('does not use the library below desktop width', () => {
    viewport.set(false)
    render(<Harness />)
    expect(screen.queryByTestId('rgl')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Move or resize/ })).not.toBeInTheDocument()
  })
})

describe('keyboard move and resize on the handle', () => {
  const handle = (title: string) => screen.getByRole('button', { name: `Move or resize ${title}` })

  it('arrow keys move one cell, Shift+arrow resizes, and Cancel reverses it', async () => {
    measured.mounted = false // keyboard handles are the same with or without the library
    const user = userEvent.setup()
    render(<Harness />)
    handle('C card').focus()
    await user.keyboard('{ArrowRight}')
    expect(layoutOf().find((r) => r.i === 'c')).toEqual({ i: 'c', x: 1, y: 4, w: 6, h: 3 })
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(layoutOf().find((r) => r.i === 'c')).toEqual({ i: 'c', x: 1, y: 4, w: 6, h: 4 })
    expect(selectIsDirty(editor())).toBe(true)
    editor().cancel()
    expect(layoutOf().find((r) => r.i === 'c')).toEqual({ i: 'c', x: 0, y: 4, w: 6, h: 3 })
  })

  it('an occupied move pushes the neighbour down (UI-021); a move outside the grid is announced and changes nothing', async () => {
    measured.mounted = false
    const user = userEvent.setup()
    render(<Harness />)
    handle('A note').focus()
    const before = editor().draftConfig!.sections[0].layout!
    await user.keyboard('{ArrowRight}')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const after = editor().draftConfig!.sections[0].layout!
    expect(after.find((r) => r.i === 'a')).toMatchObject({ x: 1, y: 0, w: 6, h: 4 })
    expect(after.find((r) => r.i === 'b')).toMatchObject({ x: 6, y: 4, w: 6, h: 4 }) // pushed, same size
    expect(after.find((r) => r.i === 'c')).toEqual(before.find((r) => r.i === 'c'))

    handle('C card').focus()
    const draft = editor().draftConfig
    await user.keyboard('{ArrowLeft}')
    expect(screen.getAllByRole('alert').map((n) => n.textContent)).toContain('That is outside the grid.')
    expect(editor().draftConfig).toBe(draft)
    await user.keyboard('{ArrowRight}')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // C's message was cleared by a valid move
  })
})
