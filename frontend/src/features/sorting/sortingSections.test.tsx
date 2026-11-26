import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { stubViewport } from '../../test/viewport'
import InspectorPanel from '../editor/InspectorPanel'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import WorkspaceView from '../workspace/WorkspaceView'
import { NAV_PRIMARY, SECTIONS_ROOT, stackContainerId, workspaceAdapter } from './workspaceAdapter'

/* @dnd-kit is stubbed as in SortProvider.test.tsx; real pointer gestures run in e2e/sections-sorting.mjs. */
type Operation = { operation: { source: unknown; target: unknown }; canceled?: boolean }
type Handlers = { onDragStart?: (event: Operation) => void; onDragOver?: (event: Operation) => void; onDragEnd?: (event: Operation) => void }
const provider: { current: Handlers } = { current: {} }

vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({ children, onDragStart, onDragOver, onDragEnd }: Handlers & { children: ReactNode }) => {
    provider.current = { onDragStart, onDragOver, onDragEnd }
    return <>{children}</>
  },
  useDroppable: () => ({ ref: () => {}, isDropTarget: false }),
}))
vi.mock('@dnd-kit/react/sortable', () => ({
  useSortable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
}))
vi.mock('@dnd-kit/dom/sortable', () => ({ SortableKeyboardPlugin: class {} }))

const editor = () => useEditorStore.getState()

function load() {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Sections',
    navigation: { placement: 'left', primaryItems: [{ id: 'nav-1', label: 'Home', targetSectionId: 'sGrid' }], secondaryItems: [] },
    sections: [
      {
        id: 'sGrid', kind: 'grid', title: 'Dashboard',
        widgets: [{ id: 'g1', type: 'notes', title: 'Grid note', props: { body: 'grid body' } }],
        layout: [{ i: 'g1', x: 0, y: 0, w: 6, h: 4 }],
      },
      {
        id: 'sA', kind: 'stack', title: 'Alpha',
        widgets: [
          { id: 'a1', type: 'notes', title: 'First card', props: { body: 'one' } },
          { id: 'a2', type: 'tasks', title: 'Second card', props: { items: [{ id: 't1', text: 'task', done: false }] } },
          { id: 'a3', type: 'kanban', title: 'Unsupported widget', props: { cols: [1] } },
        ],
      },
      { id: 'sB', kind: 'stack', title: 'Beta', widgets: [{ id: 'b1', type: 'notes', title: 'Beta card', props: { body: 'bee' } }] },
      { id: 'sE', kind: 'stack', title: 'Empty one', widgets: [] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
}

const sectionOrder = () => editor().draftConfig!.sections.map((s) => s.id)
const cardOrder = (id: string) => editor().draftConfig!.sections.find((s) => s.id === id)!.widgets.map((w) => w.id)
const drawnSections = () => within(screen.getByRole('list', { name: 'Sections' })).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
const drawnCards = (section: string) => within(screen.getByRole('list', { name: `${section} cards` })).queryAllByRole('article').map((card) => card.querySelector('h3')!.textContent!)

const section = (id: string) => ({ id, data: { itemId: id, containerId: SECTIONS_ROOT, itemType: 'section' } })
const card = (id: string, sectionId: string) => ({ id, data: { itemId: id, containerId: stackContainerId(sectionId), itemType: 'widget' } })
const container = (containerId: string, itemType: string) => ({ id: containerId, data: { kind: 'container', containerId, itemType } })

const start = (source: unknown) => act(() => provider.current.onDragStart!({ operation: { source, target: null } }))
const hover = (source: unknown, target: unknown) => act(() => provider.current.onDragOver!({ operation: { source, target } }))
const end = (source: unknown, target: unknown, canceled = false) => act(() => provider.current.onDragEnd!({ canceled, operation: { source, target } }))

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  stubViewport(true)
  load()
})

describe('what is draggable', () => {
  it('every visible section has a grip, stack cards are dragged by the card itself, and grid cards keep a keyboard-only handle', () => {
    render(<WorkspaceView />)
    for (const name of ['Dashboard', 'Alpha', 'Beta', 'Empty one']) expect(screen.getByRole('button', { name: `Reorder section ${name}` })).toBeInTheDocument()
    expect(drawnCards('Alpha')).toEqual(['First card', 'Second card', 'Unsupported widget'])
    expect(drawnCards('Beta')).toEqual(['Beta card'])
    expect(screen.queryByRole('button', { name: /^Reorder card / })).not.toBeInTheDocument() // no visible card grips any more
    expect(screen.getByRole('button', { name: /^Move or resize Grid note/ })).toBeInTheDocument()
  })

  it('an empty stack section is an explicit drop target', () => {
    render(<WorkspaceView />)
    expect(screen.getByText(/This section is empty.*drag a card here/i)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Empty one cards' })).toBeInTheDocument()
  })

  it('Preview shows no grips and no sortable lists', () => {
    render(<WorkspaceView />)
    act(() => editor().setMode('preview'))
    expect(screen.queryByRole('button', { name: /^Reorder / })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Sections' })).not.toBeInTheDocument()
    expect(drawnSectionsPlain()).toEqual(['Dashboard', 'Alpha', 'Beta', 'Empty one'])
  })
  const drawnSectionsPlain = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
})

describe('reordering sections', () => {
  it('previews while dragging, then commits one move that carries every widget and its geometry', () => {
    render(<WorkspaceView />)
    const before = editor().draftConfig!
    start(section('sGrid'))
    hover(section('sGrid'), section('sB'))
    expect(drawnSections()).toEqual(['Alpha', 'Beta', 'Dashboard', 'Empty one'])
    expect(editor().draftConfig).toBe(before) // nothing committed yet
    end(section('sGrid'), section('sB'))
    expect(sectionOrder()).toEqual(['sA', 'sB', 'sGrid', 'sE'])
    const moved = editor().draftConfig!.sections.find((s) => s.id === 'sGrid')!
    expect(moved).toBe(before.sections[0]) // the same object: widgets, layout and props come along
    expect(moved.layout).toEqual([{ i: 'g1', x: 0, y: 0, w: 6, h: 4 }])
    expect(selectIsDirty(editor())).toBe(true)
  })

  it('Escape or an outside drop leaves the order untouched', () => {
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(section('sA'))
    hover(section('sA'), section('sE'))
    end(section('sA'), section('sE'), true)
    expect(editor().draftConfig).toBe(before)
    expect(drawnSections()).toEqual(['Dashboard', 'Alpha', 'Beta', 'Empty one'])
    start(section('sA'))
    hover(section('sA'), section('sE'))
    end(section('sA'), null)
    expect(editor().draftConfig).toBe(before)
  })

  it('a section can never be nested: it cannot be previewed or dropped into a card container', () => {
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(section('sB'))
    hover(section('sB'), container(stackContainerId('sE'), 'widget'))
    hover(section('sB'), card('a1', 'sA'))
    expect(drawnSections()).toEqual(['Dashboard', 'Alpha', 'Beta', 'Empty one'])
    end(section('sB'), card('a1', 'sA'))
    expect(editor().draftConfig).toBe(before)
    expect(workspaceAdapter.canMove({ itemId: 'sB', fromContainerId: SECTIONS_ROOT, toContainerId: stackContainerId('sE'), toIndex: 0 })).not.toBeNull()
  })
})

describe('reordering and transferring stack cards', () => {
  it('reorders cards within a section, and the section itself does not move', () => {
    render(<WorkspaceView />)
    const sectionsBefore = sectionOrder()
    start(card('a1', 'sA'))
    hover(card('a1', 'sA'), card('a2', 'sA'))
    expect(drawnCards('Alpha')).toEqual(['Second card', 'First card', 'Unsupported widget'])
    expect(drawnSections()).toEqual(['Dashboard', 'Alpha', 'Beta', 'Empty one']) // sections unchanged during the card drag
    end(card('a1', 'sA'), card('a2', 'sA'))
    expect(cardOrder('sA')).toEqual(['a2', 'a1', 'a3'])
    expect(sectionOrder()).toEqual(sectionsBefore)
  })

  it('a card over a section target never previews or moves that section', () => {
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(card('a1', 'sA'))
    hover(card('a1', 'sA'), section('sB'))
    hover(card('a1', 'sA'), container(SECTIONS_ROOT, 'section'))
    expect(drawnSections()).toEqual(['Dashboard', 'Alpha', 'Beta', 'Empty one'])
    expect(drawnCards('Alpha')).toEqual(['First card', 'Second card', 'Unsupported widget'])
    end(card('a1', 'sA'), section('sB'))
    expect(editor().draftConfig).toBe(before)
  })

  it('transfers a card into an empty stack section: id and content preserved, present exactly once', () => {
    render(<WorkspaceView />)
    const original = editor().draftConfig!.sections[2].widgets[0]
    start(card('b1', 'sB'))
    hover(card('b1', 'sB'), container(stackContainerId('sE'), 'widget'))
    expect(drawnCards('Empty one')).toEqual(['Beta card'])
    expect(drawnCards('Beta')).toEqual([])
    end(card('b1', 'sB'), container(stackContainerId('sE'), 'widget'))
    expect(cardOrder('sE')).toEqual(['b1'])
    expect(cardOrder('sB')).toEqual([])
    expect(editor().draftConfig!.sections[3].widgets[0]).toBe(original)
    const all = editor().draftConfig!.sections.flatMap((s) => s.widgets.map((w) => w.id))
    expect(all.filter((id) => id === 'b1')).toHaveLength(1)
  })

  it('transfers a card between two non-empty stack sections at the hovered position', () => {
    render(<WorkspaceView />)
    start(card('a2', 'sA'))
    hover(card('a2', 'sA'), card('b1', 'sB'))
    end(card('a2', 'sA'), card('b1', 'sB'))
    expect(cardOrder('sB')).toEqual(['a2', 'b1'])
    expect(cardOrder('sA')).toEqual(['a1', 'a3'])
  })

  it('an unsupported widget can be reordered in its section but never previews or lands in another', () => {
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(card('a3', 'sA'))
    hover(card('a3', 'sA'), container(stackContainerId('sE'), 'widget'))
    expect(drawnCards('Empty one')).toEqual([]) // checked after each hover: it must never show up in another section
    expect(drawnCards('Alpha')).toEqual(['First card', 'Second card', 'Unsupported widget'])
    hover(card('a3', 'sA'), card('b1', 'sB'))
    expect(drawnCards('Beta')).toEqual(['Beta card'])
    expect(drawnCards('Alpha')).toEqual(['First card', 'Second card', 'Unsupported widget'])
    end(card('a3', 'sA'), card('b1', 'sB'))
    expect(editor().draftConfig).toBe(before)

    start(card('a3', 'sA'))
    hover(card('a3', 'sA'), card('a1', 'sA'))
    end(card('a3', 'sA'), card('a1', 'sA'))
    expect(cardOrder('sA')).toEqual(['a3', 'a1', 'a2'])
  })

  it('a card cannot become a navigation item or a section', () => {
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(card('a1', 'sA'))
    hover(card('a1', 'sA'), container(NAV_PRIMARY, 'nav-item'))
    hover(card('a1', 'sA'), container(SECTIONS_ROOT, 'section'))
    end(card('a1', 'sA'), container(NAV_PRIMARY, 'nav-item'))
    expect(editor().draftConfig).toBe(before)
    for (const to of [NAV_PRIMARY, SECTIONS_ROOT]) {
      const request = { itemId: 'a1', fromContainerId: stackContainerId('sA'), toContainerId: to, toIndex: 0 }
      expect(workspaceAdapter.canMove(request)).toBe('That item cannot be moved there.')
      expect(workspaceAdapter.commitMove(request).status).toBe('rejected')
    }
    expect(editor().draftConfig!.navigation.primaryItems.map((i) => i.id)).toEqual(['nav-1'])
  })

  it('grid sections take no part: no stack container exists for them', () => {
    expect(workspaceAdapter.readItems(stackContainerId('sGrid'))).toBeNull()
    expect(workspaceAdapter.commitMove({ itemId: 'a1', fromContainerId: stackContainerId('sA'), toContainerId: stackContainerId('sGrid'), toIndex: 0 }).status).toBe('rejected')
  })
})

describe('the adapter containers', () => {
  it('lists visible sections and visible stack cards only', () => {
    act(() => {
      editor().apply((c) => ({ ok: true, config: { ...c, sections: c.sections.map((s) => (s.id === 'sB' ? { ...s, hidden: true } : s.id === 'sA' ? { ...s, widgets: s.widgets.map((w) => (w.id === 'a2' ? { ...w, hidden: true } : w)) } : s)) } }))
    })
    expect(workspaceAdapter.readItems(SECTIONS_ROOT)).toEqual(['sGrid', 'sA', 'sE'])
    expect(workspaceAdapter.readItems(stackContainerId('sA'))).toEqual(['a1', 'a3'])
  })
})

describe('Move buttons for sections and cards', () => {
  const properties = (selection: { kind: 'section' | 'widget'; id: string }) => {
    act(() => editor().select(selection))
    return render(<InspectorPanel />)
  }
  const press = async (name: string) => userEvent.setup().click(within(document.body).getAllByRole('button', { name }).at(-1)!)

  it('Move up and Move down reorder sections through the same command', async () => {
    properties({ kind: 'section', id: 'sA' })
    await press('Move down')
    expect(sectionOrder()).toEqual(['sGrid', 'sB', 'sA', 'sE'])
    await press('Move up')
    await press('Move up')
    expect(sectionOrder()).toEqual(['sA', 'sGrid', 'sB', 'sE'])
  })

  it('a registered card offers Move to each other stack section; an unsupported one only moves within its section', async () => {
    const { unmount } = properties({ kind: 'widget', id: 'a1' })
    const body = within(document.body)
    expect(body.getByRole('button', { name: 'Move to Beta' })).toBeInTheDocument()
    expect(body.getByRole('button', { name: 'Move to Empty one' })).toBeInTheDocument()
    expect(body.queryByRole('button', { name: 'Move to Dashboard' })).not.toBeInTheDocument() // grid sections are not destinations
    await press('Move to Empty one')
    expect(cardOrder('sE')).toEqual(['a1'])
    unmount()
    properties({ kind: 'widget', id: 'a3' })
    expect(within(document.body).queryByRole('button', { name: /^Move to / })).not.toBeInTheDocument()
    expect(within(document.body).getAllByRole('button', { name: 'Move up' }).length).toBeGreaterThan(0)
  })

  it('a move by button is one change that Cancel reverses', async () => {
    properties({ kind: 'widget', id: 'b1' })
    await press('Move to Alpha')
    expect(selectIsDirty(editor())).toBe(true)
    act(() => {
      editor().cancel()
    })
    expect(cardOrder('sB')).toEqual(['b1'])
    expect(cardOrder('sA')).toEqual(['a1', 'a2', 'a3'])
  })
})
