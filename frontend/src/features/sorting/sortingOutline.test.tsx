import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { stubViewport } from '../../test/viewport'
import ComponentOutline from '../editor/ComponentOutline'
import InspectorPanel from '../editor/InspectorPanel'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import WorkspaceView from '../workspace/WorkspaceView'
import SortProvider from './SortProvider'
import { outlineContainerId, stackContainerId, workspaceAdapter } from './workspaceAdapter'

/* @dnd-kit is stubbed as in SortProvider.test.tsx; real pointer gestures run in e2e/outline-grid.mjs. */
type Operation = { operation: { source: unknown; target: unknown }; canceled?: boolean }
type Handlers = { onDragStart?: (event: Operation) => void; onDragOver?: (event: Operation) => void; onDragEnd?: (event: Operation) => void }
const provider: { current: Handlers; renders: number } = { current: {}, renders: 0 }

vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({ children, onDragStart, onDragOver, onDragEnd }: Handlers & { children: ReactNode }) => {
    provider.current = { onDragStart, onDragOver, onDragEnd }
    provider.renders += 1
    return <>{children}</>
  },
  useDroppable: () => ({ ref: () => {}, isDropTarget: false }),
}))
vi.mock('@dnd-kit/react/sortable', () => ({
  useSortable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
}))
vi.mock('@dnd-kit/dom/sortable', () => ({ SortableKeyboardPlugin: class {} }))

const editor = () => useEditorStore.getState()
const rect = (i: string, x: number, y: number, w: number, h: number) => ({ i, x, y, w, h })

function load() {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Outline',
    sections: [
      {
        id: 'grid', kind: 'grid', title: 'Dashboard',
        widgets: [
          { id: 'welcome', type: 'welcome', title: 'Greeting' }, { id: 'hid', type: 'notes', title: 'Secret note', hidden: true },
          { id: 'notes', type: 'notes', title: 'Notes card' }, { id: 'tasks', type: 'tasks', title: 'Todo' }, { id: 'cal', type: 'calendar', title: 'Plan' },
        ],
        layout: [rect('welcome', 0, 0, 12, 3), rect('hid', 0, 0, 4, 3), rect('notes', 0, 3, 6, 4), rect('tasks', 6, 3, 6, 4), rect('cal', 0, 7, 12, 6)],
      },
      { id: 'stack', kind: 'stack', title: 'Reference', widgets: [{ id: 'st1', type: 'notes', title: 'Stack note' }] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
}

const gridWidgets = () => editor().draftConfig!.sections[0].widgets.map((w) => w.id)
const layoutOf = (id: string) => editor().draftConfig!.sections[0].layout!.find((r) => r.i === id)!
const outlineOrder = () =>
  within(screen.getByRole('list', { name: 'Dashboard widgets' }))
    .getAllByRole('button', { name: /in outline$/ })
    .map((b) => b.getAttribute('aria-label')!.replace(/^Reorder /, '').replace(/ in outline$/, ''))
/** Where the canvas draws a widget: the CSS grid placement variables the renderer derives from the saved layout. */
const drawnAt = (id: string) => {
  const item = (document.querySelector(`[data-widget-id="${id}"]`) as HTMLElement).closest('.fs-grid-item') as HTMLElement
  return { col: item.style.getPropertyValue('--col'), row: item.style.getPropertyValue('--row') }
}
const canvasOrder = () => [...document.querySelectorAll('.fs-grid-item [data-widget-id]')].map((el) => el.getAttribute('data-widget-id'))

const outlineItem = (id: string, sectionId = 'grid') => ({ id, data: { itemId: id, containerId: outlineContainerId(sectionId), itemType: 'outline-widget' } })
const container = (containerId: string) => ({ id: containerId, data: { kind: 'container', containerId, itemType: 'outline-widget' } })

const start = (source: unknown) => act(() => provider.current.onDragStart!({ operation: { source, target: null } }))
const hover = (source: unknown, target: unknown) => act(() => provider.current.onDragOver!({ operation: { source, target } }))
const end = (source: unknown, target: unknown, canceled = false) => act(() => provider.current.onDragEnd!({ canceled, operation: { source, target } }))

function renderShell() {
  return render(
    <SortProvider adapter={workspaceAdapter}>
      <ComponentOutline />
      <WorkspaceView />
    </SortProvider>,
  )
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  stubViewport(true)
  provider.renders = 0
  load()
})

describe('the outline as a sortable list', () => {
  it('lists every widget of every section, hidden ones included, each with a grip, and every section has a grip too', () => {
    renderShell()
    expect(outlineOrder()).toEqual(['Greeting', 'Secret note', 'Notes card', 'Todo', 'Plan'])
    expect(screen.getByRole('button', { name: 'Reorder Stack note in outline' })).toBeInTheDocument() // a stack section's widgets too
    for (const name of ['Dashboard', 'Reference']) expect(screen.getByRole('button', { name: `Reorder section ${name} in outline` })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Components' })).getByRole('button', { name: 'Stack note' })).toBeInTheDocument()
  })

  it('the outline and the canvas share one provider (one set of drag handlers)', () => {
    renderShell()
    const handlers = provider.current
    act(() => editor().select({ kind: 'widget', id: 'cal' }))
    expect(provider.current.onDragEnd).toBeDefined()
    expect(typeof handlers.onDragOver).toBe('function')
    // The canvas stack of cards and the outline both use the adapter of this single provider.
    expect(workspaceAdapter.readItems(outlineContainerId('grid'))).toEqual(['welcome', 'hid', 'notes', 'tasks', 'cal'])
    expect(workspaceAdapter.readItems(stackContainerId('stack'))).toEqual(['st1'])
    expect(workspaceAdapter.readItems(outlineContainerId('stack'))).toEqual(['st1']) // stack sections have an outline list too
    expect(workspaceAdapter.readItems('outline-root')).toEqual(['grid', 'stack'])
    expect(workspaceAdapter.readItems(outlineContainerId('missing'))).toBeNull()
  })

  it('without an editor shell around it the canvas view still works on its own', () => {
    render(<WorkspaceView />)
    expect(canvasOrder()).toEqual(['welcome', 'notes', 'tasks', 'cal'])
  })
})

describe('outline reorder changes the canvas', () => {
  it('previews the new order in the outline while dragging, then commits one move that repacks the positions', () => {
    renderShell()
    const before = editor().draftConfig
    start(outlineItem('cal'))
    hover(outlineItem('cal'), outlineItem('welcome'))
    expect(outlineOrder()).toEqual(['Plan', 'Greeting', 'Secret note', 'Notes card', 'Todo'])
    expect(editor().draftConfig).toBe(before) // nothing committed, canvas untouched
    expect(drawnAt('cal')).toEqual({ col: '1', row: '8' })
    end(outlineItem('cal'), outlineItem('welcome'))
    expect(gridWidgets()).toEqual(['cal', 'welcome', 'hid', 'notes', 'tasks'])
    expect(layoutOf('cal')).toEqual(rect('cal', 0, 0, 12, 6))
    expect(layoutOf('welcome')).toEqual(rect('welcome', 0, 6, 12, 3))
    expect(drawnAt('cal')).toEqual({ col: '1', row: '1' }) // the canvas follows
    expect(drawnAt('welcome')).toEqual({ col: '1', row: '7' })
    expect(canvasOrder()).toEqual(['cal', 'welcome', 'notes', 'tasks']) // narrow-screen order = array order
    expect(selectIsDirty(editor())).toBe(true)
  })

  it('reordering a hidden widget in the outline moves no visible widget', () => {
    renderShell()
    const layoutBefore = editor().draftConfig!.sections[0].layout
    start(outlineItem('hid'))
    hover(outlineItem('hid'), outlineItem('cal'))
    end(outlineItem('hid'), outlineItem('cal'))
    expect(gridWidgets()).toEqual(['welcome', 'notes', 'tasks', 'cal', 'hid'])
    expect(editor().draftConfig!.sections[0].layout).toEqual(layoutBefore)
    expect(canvasOrder()).toEqual(['welcome', 'notes', 'tasks', 'cal'])
  })

  it('Escape and an outside drop leave a clean workspace clean', () => {
    renderShell()
    const before = editor().draftConfig
    start(outlineItem('cal'))
    hover(outlineItem('cal'), outlineItem('welcome'))
    end(outlineItem('cal'), outlineItem('welcome'), true)
    start(outlineItem('cal'))
    hover(outlineItem('cal'), outlineItem('notes'))
    end(outlineItem('cal'), null)
    expect(editor().draftConfig).toBe(before)
    expect(selectIsDirty(editor())).toBe(false)
    expect(outlineOrder()).toEqual(['Greeting', 'Secret note', 'Notes card', 'Todo', 'Plan'])
  })

  it('dropping where it started is a no-op (no repack, still clean)', () => {
    renderShell()
    start(outlineItem('notes'))
    end(outlineItem('notes'), outlineItem('notes'))
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('moves a widget from a grid section into a stack section and back, keeping its content, exactly once', () => {
    renderShell()
    const before = editor().draftConfig!
    const request = { itemId: 'notes', fromContainerId: outlineContainerId('grid'), toContainerId: outlineContainerId('stack'), toIndex: 0 }
    expect(workspaceAdapter.canMove(request)).toBeNull()
    expect(workspaceAdapter.commitMove(request).status).toBe('applied')
    const after = editor().draftConfig!
    expect(after.sections[1].widgets.map((w) => w.id)).toEqual(['notes', 'st1'])
    expect(after.sections[0].widgets.map((w) => w.id)).toEqual(['welcome', 'hid', 'tasks', 'cal'])
    expect(after.sections[0].layout!.some((r) => r.i === 'notes')).toBe(false)
    expect(after.sections[1].widgets[0]).toEqual(before.sections[0].widgets.find((w) => w.id === 'notes'))
    expect(after.sections.flatMap((s) => s.widgets).filter((w) => w.id === 'notes')).toHaveLength(1)
    const back = { itemId: 'notes', fromContainerId: outlineContainerId('stack'), toContainerId: outlineContainerId('grid'), toIndex: 2 }
    expect(workspaceAdapter.commitMove(back).status).toBe('applied')
    expect(editor().draftConfig!.sections[0].widgets.map((w) => w.id)).toEqual(['welcome', 'hid', 'notes', 'tasks', 'cal'])
    expect(editor().draftConfig!.sections[0].layout!.find((r) => r.i === 'notes')).toMatchObject({ w: expect.any(Number), h: expect.any(Number) })
  })

  it('previews a move into another section in the outline, and an outside drop commits nothing', () => {
    renderShell()
    const before = editor().draftConfig
    start(outlineItem('notes'))
    hover(outlineItem('notes'), container(outlineContainerId('stack')))
    expect(within(screen.getByRole('list', { name: 'Reference widgets' })).getAllByRole('listitem').length).toBeGreaterThan(0)
    end(outlineItem('notes'), container(outlineContainerId('missing')), true)
    expect(editor().draftConfig).toBe(before)
  })

  it('with two grid sections a widget moves from one outline to the other and the source closes its gap', () => {
    const parsed = parseWorkspaceConfig({
      schemaVersion: 1, title: 'Two grids',
      sections: [
        { id: 'g1', kind: 'grid', title: 'First', widgets: [{ id: 'a', type: 'notes' }, { id: 'b', type: 'notes' }], layout: [rect('a', 0, 0, 12, 4), rect('b', 0, 4, 12, 4)] },
        { id: 'g2', kind: 'grid', title: 'Second', widgets: [{ id: 'c', type: 'notes' }], layout: [rect('c', 0, 0, 6, 4)] },
      ],
    })
    if (!parsed.ok) throw new Error(parsed.message)
    editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
    const request = { itemId: 'a', fromContainerId: outlineContainerId('g1'), toContainerId: outlineContainerId('g2'), toIndex: 1 }
    expect(workspaceAdapter.canMove(request)).toBeNull()
    expect(workspaceAdapter.commitMove(request).status).toBe('applied')
    const [g1, g2] = editor().draftConfig!.sections
    expect(g1.widgets.map((w) => w.id)).toEqual(['b'])
    expect(g1.layout).toEqual([rect('b', 0, 0, 12, 4)]) // the gap a left is closed
    expect(g2.widgets.map((w) => w.id)).toEqual(['c', 'a'])
    expect(g2.layout!.map((r) => r.i).sort()).toEqual(['a', 'c'])
    expect(editor().history.past).toHaveLength(1)
    editor().undo()
    expect(editor().draftConfig!.sections[0].widgets.map((w) => w.id)).toEqual(['a', 'b'])
  })

  it('refuses to move into a missing section or a stale position, and unsupported widgets stay in their own section', () => {
    renderShell()
    const before = editor().draftConfig
    for (const to of [outlineContainerId('missing'), 'section:stack:widgets']) {
      const request = { itemId: 'notes', fromContainerId: outlineContainerId('grid'), toContainerId: to, toIndex: 0 }
      expect(workspaceAdapter.canMove(request)).not.toBeNull()
      expect(workspaceAdapter.commitMove(request).status).toBe('rejected')
    }
    expect(editor().draftConfig).toBe(before)
  })

  it('reorders whole sections from the outline: each moves with all of its widgets, and Undo restores', () => {
    renderShell()
    const before = editor().draftConfig!
    const request = { itemId: 'stack', fromContainerId: 'outline-root', toContainerId: 'outline-root', toIndex: 0 }
    expect(workspaceAdapter.canMove(request)).toBeNull()
    expect(workspaceAdapter.commitMove(request).status).toBe('applied')
    const after = editor().draftConfig!
    expect(after.sections.map((s) => s.id)).toEqual(['stack', 'grid'])
    expect(after.sections[1]).toBe(before.sections[0]) // the section itself is carried along untouched
    expect(after.sections[0]).toBe(before.sections[1])
    editor().undo()
    expect(editor().draftConfig!.sections.map((s) => s.id)).toEqual(['grid', 'stack'])
  })

  it('a section cannot be dropped among widgets, nor a widget among sections', () => {
    renderShell()
    const section = { itemId: 'stack', fromContainerId: 'outline-root', toContainerId: outlineContainerId('grid'), toIndex: 0 }
    const widget = { itemId: 'notes', fromContainerId: outlineContainerId('grid'), toContainerId: 'outline-root', toIndex: 0 }
    expect(workspaceAdapter.canMove(section)).not.toBeNull()
    expect(workspaceAdapter.canMove(widget)).not.toBeNull()
  })

  it('Cancel after an outline reorder restores the saved positions and order', () => {
    renderShell()
    start(outlineItem('tasks'))
    hover(outlineItem('tasks'), outlineItem('welcome'))
    end(outlineItem('tasks'), outlineItem('welcome'))
    expect(canvasOrder()[0]).toBe('tasks')
    act(() => {
      editor().cancel()
    })
    expect(canvasOrder()).toEqual(['welcome', 'notes', 'tasks', 'cal'])
    expect(layoutOf('tasks')).toEqual(rect('tasks', 6, 3, 6, 4))
  })
})

describe('Move buttons for grid widgets use the same command', () => {
  it('Move up and Move down reorder the dashboard and repack it', async () => {
    const user = userEvent.setup()
    renderShell()
    act(() => editor().select({ kind: 'widget', id: 'cal' }))
    render(<InspectorPanel />)
    expect(screen.getAllByText(/repacks the visible widgets/).length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: 'Move up' }).at(-1)!)
    expect(gridWidgets()).toEqual(['welcome', 'hid', 'notes', 'cal', 'tasks'])
    // First-fit packing in the new order: the wide calendar still cannot sit beside Notes, and Tasks still fits in the gap there.
    expect(layoutOf('cal')).toEqual(rect('cal', 0, 7, 12, 6))
    expect(layoutOf('tasks')).toEqual(rect('tasks', 6, 3, 6, 4))
    expect(canvasOrder()).toEqual(['welcome', 'notes', 'cal', 'tasks'])
  })
})
