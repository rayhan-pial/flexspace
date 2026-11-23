import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_LIST_ITEMS } from '../../domain/workspace/constants'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import type { WorkspaceConfig } from '../../domain/workspace/types'
import { stubViewport } from '../../test/viewport'
import InspectorPanel from '../editor/InspectorPanel'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import WorkspaceView from '../workspace/WorkspaceView'
import { listContainerId, workspaceAdapter } from './workspaceAdapter'

/* @dnd-kit is stubbed as in SortProvider.test.tsx; real pointer gestures run in e2e/lists-sorting.mjs. */
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
const t = (id: string, text: string, done = false) => ({ id, text, done })
const img = (id: string, caption: string) => ({ id, assetKey: 'aurora', alt: `alt ${caption}`, caption })

function build(extra: Partial<{ bigTasks: boolean }> = {}): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Lists',
    sections: [
      {
        id: 's1', kind: 'stack', title: 'Main',
        widgets: [
          { id: 'tA', type: 'tasks', title: 'Today', props: { items: [t('t1', 'Write', true), t('t2', 'Review'), t('t3', 'Ship')] } },
          { id: 'tE', type: 'tasks', title: 'Later', props: { items: [] } },
          { id: 'gA', type: 'gallery', title: 'Photos', props: { items: [img('i1', 'sunrise'), img('i2', 'harbour')] } },
          { id: 'gE', type: 'gallery', title: 'Empty photos', props: { items: [] } },
          { id: 'tHid', type: 'tasks', title: 'Hidden list', hidden: true, props: { items: [] } },
          ...(extra.bigTasks ? [{ id: 'tBig', type: 'tasks', title: 'Full list', props: { items: Array.from({ length: MAX_LIST_ITEMS }, (_, n) => t(`b${n}`, `big ${n}`)) } }] : []),
        ],
      },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.config
}
function load(config = build()) {
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config })
}

const widget = (id: string) => editor().draftConfig!.sections[0].widgets.find((w) => w.id === id)!
const ids = (widgetId: string) => (widget(widgetId).props.items as Array<{ id: string }>).map((i) => i.id)
const drawnTasks = (title: string) =>
  within(screen.getByRole('list', { name: `${title} list` })).queryAllByRole('button', { name: /^Reorder task / }).map((b) => b.getAttribute('aria-label')!.replace('Reorder task ', ''))
const drawnImages = (title: string) =>
  within(screen.getByRole('list', { name: `${title} images` })).queryAllByRole('button', { name: /^Reorder image / }).map((b) => b.getAttribute('aria-label')!.replace('Reorder image ', ''))

const taskItem = (id: string, widgetId: string) => ({ id, data: { itemId: id, containerId: listContainerId('tasks', widgetId), itemType: 'task' } })
const tile = (id: string, widgetId: string) => ({ id, data: { itemId: id, containerId: listContainerId('gallery', widgetId), itemType: 'gallery-item' } })
const container = (containerId: string, itemType: string) => ({ id: containerId, data: { kind: 'container', containerId, itemType } })
const taskList = (widgetId: string) => container(listContainerId('tasks', widgetId), 'task')
const galleryList = (widgetId: string) => container(listContainerId('gallery', widgetId), 'gallery-item')

const start = (source: unknown) => act(() => provider.current.onDragStart!({ operation: { source, target: null } }))
const hover = (source: unknown, target: unknown) => act(() => provider.current.onDragOver!({ operation: { source, target } }))
const end = (source: unknown, target: unknown, canceled = false) => act(() => provider.current.onDragEnd!({ canceled, operation: { source, target } }))

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  stubViewport(true)
})

describe('what is draggable', () => {
  it('every task row and every gallery tile has its own grip in Edit, and Preview has none', () => {
    load()
    render(<WorkspaceView />)
    expect(drawnTasks('Today')).toEqual(['Write', 'Review', 'Ship'])
    expect(drawnImages('Photos')).toEqual(['alt sunrise', 'alt harbour'])
    expect(screen.getByRole('list', { name: 'Later list' })).toBeInTheDocument() // an empty list is still a (drop) container
    expect(screen.getByRole('list', { name: 'Empty photos images' })).toBeInTheDocument()
    expect(screen.getByText(/drag a task here/i)).toBeInTheDocument()
    act(() => editor().setMode('preview'))
    expect(screen.queryByRole('button', { name: /^Reorder / })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Mark "Review" done/ })).toBeInTheDocument() // checking still works in Preview
  })

  it('the row controls are not part of the grip: only the grip carries the drag handle', () => {
    load()
    render(<WorkspaceView />)
    const grips = screen.getAllByRole('button', { name: /^Reorder task / })
    expect(grips).toHaveLength(3)
    for (const control of [screen.getByRole('checkbox', { name: /Mark "Write"/ }), screen.getByRole('textbox', { name: /Task text: Write/ }), screen.getByRole('button', { name: 'Delete task "Write"' })]) {
      expect(grips.some((grip) => grip.contains(control))).toBe(false)
    }
  })
})

describe('sorting and transferring tasks', () => {
  it('previews a reorder without touching the draft, then commits one move', () => {
    load()
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(taskItem('t1', 'tA'))
    hover(taskItem('t1', 'tA'), taskItem('t3', 'tA'))
    expect(drawnTasks('Today')).toEqual(['Review', 'Ship', 'Write'])
    expect(editor().draftConfig).toBe(before)
    end(taskItem('t1', 'tA'), taskItem('t3', 'tA'))
    expect(ids('tA')).toEqual(['t2', 't3', 't1'])
    expect(selectIsDirty(editor())).toBe(true)
  })

  it('cancellation restores the initial draft exactly, after a preview across widgets', () => {
    load()
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(taskItem('t2', 'tA'))
    hover(taskItem('t2', 'tA'), taskList('tE'))
    expect(drawnTasks('Later')).toEqual(['Review'])
    end(taskItem('t2', 'tA'), taskList('tE'), true)
    expect(editor().draftConfig).toBe(before)
    expect(drawnTasks('Today')).toEqual(['Write', 'Review', 'Ship'])
    expect(drawnTasks('Later')).toEqual([])
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('moves a task into an empty Tasks widget: completion kept, owned by exactly one widget', () => {
    load()
    render(<WorkspaceView />)
    start(taskItem('t1', 'tA'))
    hover(taskItem('t1', 'tA'), taskList('tE'))
    expect(drawnTasks('Later')).toEqual(['Write'])
    expect(drawnTasks('Today')).toEqual(['Review', 'Ship'])
    end(taskItem('t1', 'tA'), taskList('tE'))
    expect(ids('tE')).toEqual(['t1'])
    expect(ids('tA')).toEqual(['t2', 't3'])
    expect((widget('tE').props.items as Array<{ done: boolean }>)[0].done).toBe(true)
    const all = ['tA', 'tE', 'tHid'].flatMap(ids)
    expect(all.filter((id) => id === 't1')).toHaveLength(1)
  })

  it('a task dragged over a gallery tile or a gallery container previews nothing and moves nothing', () => {
    load()
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(taskItem('t1', 'tA'))
    hover(taskItem('t1', 'tA'), galleryList('gE'))
    hover(taskItem('t1', 'tA'), tile('i1', 'gA'))
    expect(drawnImages('Photos')).toEqual(['alt sunrise', 'alt harbour'])
    expect(drawnImages('Empty photos')).toEqual([])
    expect(drawnTasks('Today')).toEqual(['Write', 'Review', 'Ship'])
    end(taskItem('t1', 'tA'), tile('i1', 'gA'))
    expect(editor().draftConfig).toBe(before)
    for (const to of [listContainerId('gallery', 'gE'), listContainerId('gallery', 'gA')]) {
      const request = { itemId: 't1', fromContainerId: listContainerId('tasks', 'tA'), toContainerId: to, toIndex: 0 }
      expect(workspaceAdapter.canMove(request)).toBe('That item cannot be moved there.')
      expect(workspaceAdapter.commitMove(request).status).toBe('rejected')
    }
  })

  it('a destination that already holds the maximum is refused during the preview and at commit', () => {
    load(build({ bigTasks: true }))
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(taskItem('t1', 'tA'))
    hover(taskItem('t1', 'tA'), taskList('tBig'))
    expect(drawnTasks('Today')).toEqual(['Write', 'Review', 'Ship'])
    end(taskItem('t1', 'tA'), taskList('tBig'))
    expect(editor().draftConfig).toBe(before)
    const request = { itemId: 't1', fromContainerId: listContainerId('tasks', 'tA'), toContainerId: listContainerId('tasks', 'tBig'), toIndex: 0 }
    expect(workspaceAdapter.canMove(request)).toMatch(/already holds 100 items/)
    expect(workspaceAdapter.commitMove(request).status).toBe('rejected')
  })
})

describe('sorting and transferring gallery tiles', () => {
  it('reorders tiles, and a tile can move into an empty gallery with caption and picture intact', () => {
    load()
    render(<WorkspaceView />)
    start(tile('i2', 'gA'))
    hover(tile('i2', 'gA'), tile('i1', 'gA'))
    expect(drawnImages('Photos')).toEqual(['alt harbour', 'alt sunrise'])
    end(tile('i2', 'gA'), tile('i1', 'gA'))
    expect(ids('gA')).toEqual(['i2', 'i1'])

    start(tile('i1', 'gA'))
    hover(tile('i1', 'gA'), galleryList('gE'))
    expect(drawnImages('Empty photos')).toEqual(['alt sunrise'])
    end(tile('i1', 'gA'), galleryList('gE'))
    expect(widget('gE').props.items).toEqual([{ id: 'i1', assetKey: 'aurora', alt: 'alt sunrise', caption: 'sunrise' }])
    expect(ids('gA')).toEqual(['i2'])
  })

  it('a tile over a Tasks widget previews nothing and moves nothing', () => {
    load()
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(tile('i1', 'gA'))
    hover(tile('i1', 'gA'), taskList('tE'))
    hover(tile('i1', 'gA'), taskItem('t1', 'tA'))
    expect(drawnTasks('Later')).toEqual([])
    end(tile('i1', 'gA'), taskItem('t1', 'tA'))
    expect(editor().draftConfig).toBe(before)
  })

  it('Escape and an outside drop leave the gallery untouched', () => {
    load()
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(tile('i1', 'gA'))
    hover(tile('i1', 'gA'), tile('i2', 'gA'))
    end(tile('i1', 'gA'), tile('i2', 'gA'), true)
    start(tile('i1', 'gA'))
    hover(tile('i1', 'gA'), galleryList('gE'))
    end(tile('i1', 'gA'), null)
    expect(editor().draftConfig).toBe(before)
    expect(drawnImages('Photos')).toEqual(['alt sunrise', 'alt harbour'])
  })
})

describe('Move controls in the inspector use the same command', () => {
  const properties = (id: string) => {
    act(() => editor().select({ kind: 'widget', id }))
    return render(<InspectorPanel />)
  }
  const body = () => within(document.body)

  it('Tasks: pick a task, Move up / Move down / Move to another Tasks widget', async () => {
    load()
    const user = userEvent.setup()
    properties('tA')
    await user.selectOptions(body().getByLabelText('Task to move'), 't3')
    await user.click(body().getByRole('button', { name: 'Move up task' }))
    expect(ids('tA')).toEqual(['t1', 't3', 't2'])
    await user.click(body().getByRole('button', { name: 'Move to Later task' }))
    expect(ids('tE')).toEqual(['t3'])
    expect(ids('tA')).toEqual(['t1', 't2'])
    expect(body().queryByRole('button', { name: /Move to Hidden list/ })).not.toBeInTheDocument() // hidden widgets are not offered
    expect(body().queryByRole('button', { name: /Move to Photos/ })).not.toBeInTheDocument() // other types are not offered
  })

  it('Gallery: every image has its own Move up / Move down / Move to other galleries', async () => {
    load()
    const user = userEvent.setup()
    properties('gA')
    expect(body().getByRole('button', { name: 'Move up image 1' })).toBeDisabled()
    await user.click(body().getByRole('button', { name: 'Move down image 1' }))
    expect(ids('gA')).toEqual(['i2', 'i1'])
    await user.click(body().getByRole('button', { name: 'Move to Empty photos image 2' }))
    expect(ids('gE')).toEqual(['i1'])
    expect(ids('gA')).toEqual(['i2'])
    expect(body().queryByRole('button', { name: /Move to Today/ })).not.toBeInTheDocument()
  })

  it('a move by button is one change that Cancel reverses', async () => {
    load()
    const user = userEvent.setup()
    properties('tA')
    await user.click(body().getByRole('button', { name: 'Move to Later task' }))
    expect(selectIsDirty(editor())).toBe(true)
    act(() => {
      editor().cancel()
    })
    expect(ids('tA')).toEqual(['t1', 't2', 't3'])
    expect(ids('tE')).toEqual([])
  })
})

describe('the adapter containers', () => {
  it('list the items of a widget of that type only', () => {
    load()
    expect(workspaceAdapter.readItems(listContainerId('tasks', 'tA'))).toEqual(['t1', 't2', 't3'])
    expect(workspaceAdapter.readItems(listContainerId('gallery', 'gA'))).toEqual(['i1', 'i2'])
    expect(workspaceAdapter.readItems(listContainerId('gallery', 'tA'))).toBeNull() // tA is a Tasks widget
    expect(workspaceAdapter.readItems(listContainerId('tasks', 'gA'))).toBeNull()
    expect(workspaceAdapter.readItems('widget:ghost:tasks')).toBeNull()
    expect(workspaceAdapter.readItems('widget:tA:notes')).toBeNull()
  })
})
