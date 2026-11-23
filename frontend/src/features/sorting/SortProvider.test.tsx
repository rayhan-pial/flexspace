import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { moveNavItem } from '../../domain/workspace/reorder'
import { stubViewport } from '../../test/viewport'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import NavItemProperties from '../editor/NavItemProperties'
import WorkspaceView from '../workspace/WorkspaceView'

/*
 * jsdom has no layout, so real pointer gestures run in a browser (e2e/nav-sorting.mjs). Here
 * @dnd-kit is stubbed just enough to hand the provider's callbacks to the test, which then feeds
 * them the drag operations dnd-kit would produce: start, hover over a target, end.
 */
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
const TYPE = 'nav-item'

function load() {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Nav',
    navigation: {
      placement: 'left',
      primaryItems: [{ id: 'n1', label: 'Alpha', targetSectionId: null }, { id: 'n2', label: 'Beta', targetSectionId: null }, { id: 'n3', label: 'Gamma', targetSectionId: null }],
      secondaryItems: [],
    },
    sections: [{ id: 's1', kind: 'stack', title: 'S' }],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
}

const order = () => ({
  primary: editor().draftConfig!.navigation.primaryItems.map((i) => i.id),
  secondary: editor().draftConfig!.navigation.secondaryItems.map((i) => i.id),
})
/** The labels as currently drawn in a group (this follows the drag preview, not only the draft). */
const drawn = (group: 'Primary' | 'Secondary') =>
  within(screen.getByRole('list', { name: `${group} navigation` }))
    .queryAllByRole('button', { name: /^Reorder / })
    .map((b) => b.getAttribute('aria-label')!.replace('Reorder ', ''))

const item = (id: string, containerId: string) => ({ id, data: { itemId: id, containerId, itemType: TYPE } })
const container = (containerId: string) => ({ id: containerId, data: { kind: 'container', containerId, itemType: TYPE } })

const start = (source: unknown = item('n1', 'nav:primary')) => act(() => provider.current.onDragStart!({ operation: { source, target: null } }))
const hover = (source: unknown, target: unknown) => act(() => provider.current.onDragOver!({ operation: { source, target } }))
const end = (source: unknown, target: unknown, canceled = false) => act(() => provider.current.onDragEnd!({ canceled, operation: { source, target } }))

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  stubViewport(true)
  load()
  render(<WorkspaceView />)
})

describe('SortProvider', () => {
  it('shows the reordered preview while dragging without touching the draft, then commits exactly one move on drop', () => {
    const draft = editor().draftConfig
    start()
    expect(editor().interaction.gesture).toBe('sort')
    hover(item('n1', 'nav:primary'), item('n3', 'nav:primary'))
    expect(drawn('Primary')).toEqual(['Beta', 'Gamma', 'Alpha']) // the preview
    expect(editor().draftConfig).toBe(draft) // nothing committed yet
    end(item('n1', 'nav:primary'), item('n3', 'nav:primary'))
    expect(order()).toEqual({ primary: ['n2', 'n3', 'n1'], secondary: [] })
    expect(drawn('Primary')).toEqual(['Beta', 'Gamma', 'Alpha'])
    expect(editor().interaction.gesture).toBeNull()
    expect(selectIsDirty(editor())).toBe(true)
  })

  it('dropping on the empty group moves the item there, and the group shows it during the drag', () => {
    start(item('n2', 'nav:primary'))
    hover(item('n2', 'nav:primary'), container('nav:secondary'))
    expect(drawn('Secondary')).toEqual(['Beta'])
    expect(drawn('Primary')).toEqual(['Alpha', 'Gamma'])
    end(item('n2', 'nav:primary'), container('nav:secondary'))
    expect(order()).toEqual({ primary: ['n1', 'n3'], secondary: ['n2'] })
  })

  it('commits against the container the drag started in, even after the item re-renders in its new container', () => {
    // As seen in a real browser: once the preview moves the item, React renders it inside the new
    // list, so dnd-kit reports the *new* container for it, and the target is momentarily null at drop.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 400, top: 0, bottom: 400, width: 400, height: 400, x: 0, y: 0, toJSON: () => ({}) })
    start(item('n2', 'nav:primary'))
    hover(item('n2', 'nav:primary'), container('nav:secondary'))
    const reportedAfterRerender = item('n2', 'nav:secondary')
    act(() => provider.current.onDragEnd!({ canceled: false, operation: { source: reportedAfterRerender, target: null, position: { current: { x: 50, y: 50 } } } as never }))
    expect(order()).toEqual({ primary: ['n1', 'n3'], secondary: ['n2'] })
    vi.restoreAllMocks()
  })

  it('a null target with the pointer outside every container is an outside drop', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) })
    start(item('n2', 'nav:primary'))
    hover(item('n2', 'nav:primary'), container('nav:secondary'))
    act(() => provider.current.onDragEnd!({ canceled: false, operation: { source: item('n2', 'nav:secondary'), target: null, position: { current: { x: 900, y: 900 } } } as never }))
    expect(order()).toEqual({ primary: ['n1', 'n2', 'n3'], secondary: [] })
    expect(drawn('Primary')).toEqual(['Alpha', 'Beta', 'Gamma'])
    vi.restoreAllMocks()
  })

  it('a pointer over a container that takes a different kind of item is an outside drop', () => {
    // Only the section container has bounds around the pointer; navigation containers are elsewhere.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const near = (this.getAttribute('data-container-id') ?? '').startsWith('sections:')
      return { left: near ? 0 : 1000, right: near ? 500 : 1100, top: 0, bottom: 500, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) }
    })
    start(item('n2', 'nav:primary'))
    hover(item('n2', 'nav:primary'), item('n3', 'nav:primary'))
    act(() => provider.current.onDragEnd!({ canceled: false, operation: { source: item('n2', 'nav:primary'), target: null, position: { current: { x: 50, y: 50 } } } as never }))
    expect(order()).toEqual({ primary: ['n1', 'n2', 'n3'], secondary: [] }) // nothing committed
    vi.restoreAllMocks()
  })

  it('an item moved out and back during one drag ends where it started: a no-op', () => {
    start(item('n2', 'nav:primary'))
    hover(item('n2', 'nav:primary'), container('nav:secondary'))
    hover(item('n2', 'nav:primary'), item('n2', 'nav:primary')) // over itself: no change to the preview
    hover(item('n2', 'nav:primary'), item('n1', 'nav:primary')) // back into primary, ahead of Alpha
    hover(item('n2', 'nav:primary'), item('n3', 'nav:primary')) // and behind Gamma, then to its old slot
    hover(item('n2', 'nav:primary'), item('n3', 'nav:primary'))
    end(item('n2', 'nav:primary'), item('n3', 'nav:primary'))
    const { primary, secondary } = order()
    expect([...primary, ...secondary].sort()).toEqual(['n1', 'n2', 'n3']) // never duplicated or lost
    expect(secondary).toEqual([])
  })

  it('Escape (canceled) discards the preview: nothing changes, nothing is shown', () => {
    const draft = editor().draftConfig
    start()
    hover(item('n1', 'nav:primary'), item('n3', 'nav:primary'))
    expect(drawn('Primary')).toEqual(['Beta', 'Gamma', 'Alpha'])
    end(item('n1', 'nav:primary'), item('n3', 'nav:primary'), true)
    expect(editor().draftConfig).toBe(draft)
    expect(drawn('Primary')).toEqual(['Alpha', 'Beta', 'Gamma']) // back to the real order
    expect(editor().interaction.gesture).toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('dropping outside every target discards the preview and shows no error', () => {
    const draft = editor().draftConfig
    start()
    hover(item('n1', 'nav:primary'), item('n3', 'nav:primary'))
    end(item('n1', 'nav:primary'), null)
    expect(editor().draftConfig).toBe(draft)
    expect(drawn('Primary')).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('hovering an incompatible container never previews it, and dropping there changes nothing', () => {
    const draft = editor().draftConfig
    start()
    hover(item('n1', 'nav:primary'), container('sections:root'))
    expect(drawn('Primary')).toEqual(['Alpha', 'Beta', 'Gamma'])
    end(item('n1', 'nav:primary'), container('sections:root'))
    expect(editor().draftConfig).toBe(draft)
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('a drop whose item moved elsewhere in the meantime is refused with a reason and changes nothing', () => {
    start()
    hover(item('n1', 'nav:primary'), item('n3', 'nav:primary'))
    act(() => {
      editor().apply(moveNavItem('n1', 'secondaryItems', 0)) // something else moved n1 meanwhile
    })
    const draft = editor().draftConfig
    end(item('n1', 'nav:primary'), item('n3', 'nav:primary'))
    expect(editor().draftConfig).toBe(draft)
    expect(screen.getByRole('alert')).toHaveTextContent('That item is no longer there.')
  })

  it('a drag that moved nothing is a no-op that leaves the draft clean', () => {
    start(item('n2', 'nav:primary'))
    end(item('n2', 'nav:primary'), item('n2', 'nav:primary'))
    expect(selectIsDirty(editor())).toBe(false)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Save is refused while a drag runs and allowed again afterwards', () => {
    act(() => {
      editor().apply(moveNavItem('n1', 'primaryItems', 2)) // make the draft dirty
    })
    start()
    expect(editor().beginSave()).toBeNull()
    end(item('n1', 'nav:primary'), item('n1', 'nav:primary'), true)
    expect(editor().beginSave()).not.toBeNull()
  })

  it('leaving Edit mid-drag ends the drag state and the preview, so Save is not left blocked', () => {
    start()
    hover(item('n1', 'nav:primary'), item('n3', 'nav:primary'))
    act(() => editor().setMode('preview'))
    expect(editor().interaction.gesture).toBeNull()
    act(() => editor().setMode('edit'))
    expect(drawn('Primary')).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('refuses a drop while the session is frozen', () => {
    start()
    hover(item('n1', 'nav:primary'), item('n3', 'nav:primary'))
    act(() => editor().freeze())
    end(item('n1', 'nav:primary'), item('n3', 'nav:primary'))
    expect(order().primary).toEqual(['n1', 'n2', 'n3'])
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('Move buttons use the same command as dragging', () => {
  const renderProperties = (id: string) => {
    act(() => editor().select({ kind: 'navItem', id }))
    const found = [...editor().draftConfig!.navigation.primaryItems, ...editor().draftConfig!.navigation.secondaryItems].find((i) => i.id === id)!
    return render(<NavItemProperties item={found} config={editor().draftConfig!} />)
  }
  const last = (name: string) => within(document.body).getAllByRole('button', { name }).at(-1)!

  it('Move up and Move down reorder within the group and disable at the ends', async () => {
    const user = userEvent.setup()
    const { unmount } = renderProperties('n1')
    expect(last('Move up')).toBeDisabled()
    await user.click(last('Move down'))
    expect(order().primary).toEqual(['n2', 'n1', 'n3'])
    unmount()
    renderProperties('n3')
    expect(last('Move down')).toBeDisabled()
    await user.click(last('Move up'))
    expect(order().primary).toEqual(['n2', 'n3', 'n1'])
  })

  it('Move to Secondary puts the item in the empty group, and Move to Primary brings it back to the end', async () => {
    const user = userEvent.setup()
    const { unmount } = renderProperties('n2')
    await user.click(last('Move to Secondary'))
    expect(order()).toEqual({ primary: ['n1', 'n3'], secondary: ['n2'] })
    unmount()
    renderProperties('n2')
    await user.click(last('Move to Primary'))
    expect(order()).toEqual({ primary: ['n1', 'n3', 'n2'], secondary: [] })
  })

  it('a move by button is one draft change that Cancel reverses', async () => {
    const user = userEvent.setup()
    renderProperties('n1')
    await user.click(last('Move to Secondary'))
    expect(selectIsDirty(editor())).toBe(true)
    act(() => {
      editor().cancel()
    })
    expect(order()).toEqual({ primary: ['n1', 'n2', 'n3'], secondary: [] })
  })
})

describe('placement', () => {
  it.each([
    ['top', 'flex-row'],
    ['left', 'flex-col'],
    ['right', 'flex-col'],
  ] as const)('lays the sortable groups out for the %s placement', (placement, cls) => {
    act(() => {
      const draft = editor().draftConfig!
      editor().apply((c) => ({ ok: true, config: { ...c, navigation: { ...draft.navigation, placement } } }))
    })
    const list = screen.getByRole('list', { name: 'Primary navigation' })
    expect(list.className).toContain(cls)
    expect(screen.getByRole('list', { name: 'Secondary navigation' })).toBeInTheDocument()
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })
})

describe('spoken status for screen readers', () => {
  /** A drag source as dnd-kit reports it, with the grip that names it. */
  const named = (id: string, containerId: string, label: string) => {
    const handle = document.createElement('span')
    handle.setAttribute('aria-label', `Reorder ${label}`)
    return { ...item(id, containerId), handle }
  }
  const spoken = () => screen.getByRole('status', { name: 'Sorting status' }).textContent
  const alpha = () => named('n1', 'nav:primary', 'Alpha')

  it('names the item by its label, never by an internal id', () => {
    start(alpha())
    expect(spoken()).toBe('Picked up Alpha.')
    expect(spoken()).not.toMatch(/n1/)
  })

  it('says where the item is now, in which list, as it moves', () => {
    start(alpha())
    hover(alpha(), item('n3', 'nav:primary'))
    expect(spoken()).toBe('Alpha: position 3 of 3 in Primary navigation.')
    hover(alpha(), container('nav:secondary'))
    expect(spoken()).toBe('Alpha: position 1 of 1 in Secondary navigation.')
  })

  it('confirms a drop with its final position', () => {
    start(alpha())
    hover(alpha(), item('n3', 'nav:primary'))
    end(alpha(), item('n3', 'nav:primary'))
    expect(spoken()).toBe('Dropped Alpha at position 3 of 3 in Primary navigation.')
  })

  it('says so when a drag is cancelled, dropped outside, or ends where it began', () => {
    start(alpha())
    hover(alpha(), item('n3', 'nav:primary'))
    end(alpha(), item('n3', 'nav:primary'), true)
    expect(spoken()).toBe('Cancelled. Alpha stays where it was.')

    start(alpha())
    hover(alpha(), item('n3', 'nav:primary'))
    end(alpha(), null)
    expect(spoken()).toBe('Dropped Alpha outside any list, so nothing moved.')

    start(alpha())
    end(alpha(), item('n1', 'nav:primary'))
    expect(spoken()).toBe('Dropped Alpha in its original place.')
  })

  it('keeps reporting the position when the item is moved back to where it started', () => {
    start(alpha())
    hover(alpha(), item('n3', 'nav:primary'))
    hover(alpha(), item('n2', 'nav:primary')) // Beta is first while Alpha is previewed last
    expect(spoken()).toBe('Alpha: position 1 of 3 in Primary navigation.')
  })

  it('lives in an assertive status region that is hidden visually but read out', () => {
    const region = screen.getByRole('status', { name: 'Sorting status' })
    expect(region).toHaveAttribute('aria-live', 'assertive')
    expect(region).toHaveClass('sr-only')
  })
})

describe('Move buttons speak the result', () => {
  it('announces the new position after a move', async () => {
    act(() => editor().select({ kind: 'navItem', id: 'n1' }))
    const found = editor().draftConfig!.navigation.primaryItems.find((i) => i.id === 'n1')!
    render(<NavItemProperties item={found} config={editor().draftConfig!} />)
    await userEvent.setup().click(within(document.body).getAllByRole('button', { name: 'Move down' }).at(-1)!)
    const regions = within(document.body).getAllByRole('status').map((r) => r.textContent)
    expect(regions).toContain('Moved to position 2 of 3.')
  })
})
