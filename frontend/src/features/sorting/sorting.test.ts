import { beforeEach, describe, expect, it } from 'vitest'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import type { DropFacts, Preview, SourceFacts, TargetFacts } from './resolveDrop'
import { dragFacts, hoverPreview, pointInside, previewPlacement, resolveDrop } from './resolveDrop'
import type { MoveRequest, SortAdapter } from './types'
import { NAV_PRIMARY, NAV_SECONDARY, workspaceAdapter } from './workspaceAdapter'

const editor = () => useEditorStore.getState()

function load() {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Nav',
    navigation: {
      placement: 'top',
      primaryItems: [{ id: 'a', label: 'A', targetSectionId: null }, { id: 'b', label: 'B', targetSectionId: null }, { id: 'c', label: 'C', targetSectionId: null }],
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

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  load()
})

describe('workspace adapter', () => {
  it('reads the current order of each container from the draft, and nothing for unknown ones', () => {
    expect(workspaceAdapter.readItems(NAV_PRIMARY)).toEqual(['a', 'b', 'c'])
    expect(workspaceAdapter.readItems(NAV_SECONDARY)).toEqual([])
    for (const id of ['nav:other', 'sections:other', 'section::widgets', 'section:ghost:widgets', 'section:s1:items', 'constructor', '']) expect(workspaceAdapter.readItems(id)).toBeNull()
  })

  it('commits a move as one atomic domain command, including into the empty group', () => {
    expect(workspaceAdapter.commitMove({ itemId: 'a', fromContainerId: NAV_PRIMARY, toContainerId: NAV_SECONDARY, toIndex: 0 })).toEqual({ status: 'applied' })
    expect(order()).toEqual({ primary: ['b', 'c'], secondary: ['a'] })
    expect(workspaceAdapter.commitMove({ itemId: 'c', fromContainerId: NAV_PRIMARY, toContainerId: NAV_PRIMARY, toIndex: 0 })).toEqual({ status: 'applied' })
    expect(order()).toEqual({ primary: ['c', 'b'], secondary: ['a'] })
    expect(selectIsDirty(editor())).toBe(true)
  })

  it('a move that changes nothing is a no-op and leaves the draft clean', () => {
    const draft = editor().draftConfig
    expect(workspaceAdapter.commitMove({ itemId: 'b', fromContainerId: NAV_PRIMARY, toContainerId: NAV_PRIMARY, toIndex: 1 })).toEqual({ status: 'noop' })
    expect(editor().draftConfig).toBe(draft)
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('resolves the item by id at commit time: a stale request moves nothing', () => {
    workspaceAdapter.commitMove({ itemId: 'a', fromContainerId: NAV_PRIMARY, toContainerId: NAV_SECONDARY, toIndex: 0 })
    const draft = editor().draftConfig
    // The gesture still believes 'a' is in primary.
    const stale = workspaceAdapter.commitMove({ itemId: 'a', fromContainerId: NAV_PRIMARY, toContainerId: NAV_PRIMARY, toIndex: 0 })
    expect(stale).toEqual({ status: 'rejected', error: 'That item is no longer there.' })
    expect(editor().draftConfig).toBe(draft)
  })

  it('refuses unknown containers and unknown items without changing anything', () => {
    const draft = editor().draftConfig
    const bad: MoveRequest[] = [
      { itemId: 'a', fromContainerId: NAV_PRIMARY, toContainerId: 'sections:root', toIndex: 0 },
      { itemId: 'a', fromContainerId: 'widgets:x', toContainerId: NAV_PRIMARY, toIndex: 0 },
      { itemId: 'ghost', fromContainerId: NAV_PRIMARY, toContainerId: NAV_SECONDARY, toIndex: 0 },
      { itemId: 'a', fromContainerId: 'constructor', toContainerId: NAV_PRIMARY, toIndex: 0 },
    ]
    for (const request of bad) {
      expect(workspaceAdapter.canMove(request)).not.toBeNull()
      expect(workspaceAdapter.commitMove(request).status).toBe('rejected')
    }
    expect(editor().draftConfig).toBe(draft)
  })

  it('refuses a move while the editor is frozen (expired session)', () => {
    editor().freeze()
    expect(workspaceAdapter.commitMove({ itemId: 'a', fromContainerId: NAV_PRIMARY, toContainerId: NAV_SECONDARY, toIndex: 0 }).status).toBe('rejected')
    expect(order().primary).toEqual(['a', 'b', 'c'])
  })
})

// A stand-in adapter over fixed lists, with one forbidden container, so the pure logic is tested alone.
const lists: Record<string, string[]> = { 'c:one': ['a', 'b', 'c'], 'c:two': [], 'c:three': ['x'] }
const fake: SortAdapter = {
  readItems: (id) => (Object.hasOwn(lists, id) ? [...lists[id]] : null),
  canMove: ({ toContainerId }) => (toContainerId === 'c:three' ? 'Not allowed here.' : null),
  commitMove: () => ({ status: 'applied' }),
}
const src = (id: string, containerId = 'c:one'): SourceFacts => ({ id, containerId })
const over = (id: string, containerId = 'c:one'): TargetFacts => ({ kind: 'item', id, containerId })
const into = (containerId: string): TargetFacts => ({ kind: 'container', containerId })

describe('hoverPreview', () => {
  it('moves the item to the place of the item it is over, inside one container', () => {
    expect(hoverPreview(null, src('a'), over('c'), fake)).toEqual({ 'c:one': ['b', 'c', 'a'] })
    expect(hoverPreview(null, src('c'), over('a'), fake)).toEqual({ 'c:one': ['c', 'a', 'b'] })
  })
  it('follows the pointer across successive hovers using the previous preview', () => {
    const first = hoverPreview(null, src('a'), over('c'), fake)
    expect(hoverPreview(first, src('a'), over('b'), fake)).toEqual({ 'c:one': ['a', 'b', 'c'] })
  })
  it('puts the item at the end of an explicit container, which is how an empty one is entered', () => {
    expect(hoverPreview(null, src('b'), into('c:two'), fake)).toEqual({ 'c:one': ['a', 'c'], 'c:two': ['b'] })
  })
  it('moves between containers and back again', () => {
    const away = hoverPreview(null, src('a'), over('b', 'c:one'), fake)
    expect(away).toEqual({ 'c:one': ['b', 'a', 'c'] })
    const toTwo = hoverPreview(away, src('a'), into('c:two'), fake)
    expect(toTwo).toEqual({ 'c:one': ['b', 'c'], 'c:two': ['a'] })
    expect(hoverPreview(toTwo, src('a'), over('c', 'c:one'), fake)).toEqual({ 'c:one': ['b', 'a', 'c'], 'c:two': [] })
  })
  it('never duplicates or drops an item, whatever the hover sequence', () => {
    let preview: Preview | null = null
    const hovers: TargetFacts[] = [over('b'), into('c:two'), over('c'), into('c:two'), over('a'), into('c:two'), into('c:one')]
    for (const target of hovers) {
      preview = hoverPreview(preview, src('a'), target, fake)
      // Untouched containers keep their real contents.
      const merged = { 'c:one': ['a', 'b', 'c'], 'c:two': [] as string[], ...preview }
      const all = [...merged['c:one'], ...merged['c:two']]
      expect(all.sort()).toEqual(['a', 'b', 'c'])
    }
  })
  it('returns the same object when nothing changes', () => {
    const preview = { 'c:one': ['a', 'b', 'c'] }
    expect(hoverPreview(preview, src('a'), over('a'), fake)).toBe(preview) // over itself
    expect(hoverPreview(preview, src('a'), into('c:one'), fake)).toBe(preview) // already in that container
    expect(hoverPreview(null, src('a'), over('a'), fake)).toBeNull()
    expect(hoverPreview(null, null, over('a'), fake)).toBeNull()
    expect(hoverPreview(null, src('a'), null, fake)).toBeNull()
  })
  it('ignores incompatible containers, unknown containers and unknown items', () => {
    expect(hoverPreview(null, src('a'), into('c:three'), fake)).toBeNull()
    expect(hoverPreview(null, src('a'), into('c:missing'), fake)).toBeNull()
    expect(hoverPreview(null, src('ghost'), over('b'), fake)).toBeNull()
    expect(hoverPreview(null, src('a'), over('nope'), fake)).toBeNull()
  })
})

describe('previewPlacement', () => {
  it('finds where the preview holds an item', () => {
    expect(previewPlacement({ 'c:one': ['b', 'a'], 'c:two': ['x'] }, 'a')).toEqual({ containerId: 'c:one', index: 1 })
    expect(previewPlacement({ 'c:one': ['b'], 'c:two': ['x'] }, 'x')).toEqual({ containerId: 'c:two', index: 0 })
    expect(previewPlacement({ 'c:one': ['b'] }, 'a')).toBeNull()
    expect(previewPlacement(null, 'a')).toBeNull()
  })
})

describe('dragFacts', () => {
  it('reads sources, items and containers from dnd-kit data, and nothing from anything else', () => {
    const item = { id: 'a', data: { itemId: 'a', containerId: 'c:one', itemType: 't' } }
    const container = { id: 'c:two', data: { kind: 'container', containerId: 'c:two', itemType: 't' } }
    expect(dragFacts(item, item)).toEqual({ source: { id: 'a', containerId: 'c:one' }, target: { kind: 'item', id: 'a', containerId: 'c:one' } })
    expect(dragFacts(item, container).target).toEqual({ kind: 'container', containerId: 'c:two' })
    expect(dragFacts(null, null)).toEqual({ source: null, target: null })
    expect(dragFacts({ id: 'z', data: {} }, { id: 'y' })).toEqual({ source: null, target: null })
  })
})

describe('pointInside', () => {
  const box = { left: 10, right: 110, top: 20, bottom: 60 }
  it('is true only for points within a rectangle (edges included)', () => {
    expect(pointInside({ x: 50, y: 40 }, [box])).toBe(true)
    expect(pointInside({ x: 10, y: 20 }, [box])).toBe(true)
    expect(pointInside({ x: 111, y: 40 }, [box])).toBe(false)
    expect(pointInside({ x: 50, y: 61 }, [box])).toBe(false)
    expect(pointInside({ x: 50, y: 40 }, [])).toBe(false)
    expect(pointInside(undefined, [box])).toBe(false)
    expect(pointInside({ x: 200, y: 40 }, [box, { left: 150, right: 250, top: 0, bottom: 100 }])).toBe(true)
  })
})

describe('resolveDrop', () => {
  const facts = (change: Partial<DropFacts>): DropFacts => ({
    canceled: false,
    source: src('a'),
    overTarget: true,
    placement: { containerId: 'c:one', index: 2 },
    ...change,
  })

  it('turns the preview placement into one request with stable ids', () => {
    expect(resolveDrop(facts({}), fake)).toEqual({ request: { itemId: 'a', fromContainerId: 'c:one', toContainerId: 'c:one', toIndex: 2 } })
    expect(resolveDrop(facts({ placement: { containerId: 'c:two', index: 0 } }), fake)).toEqual({
      request: { itemId: 'a', fromContainerId: 'c:one', toContainerId: 'c:two', toIndex: 0 },
    })
  })
  it('Escape (canceled), no source, an outside drop and a drag that moved nothing all ignore', () => {
    expect(resolveDrop(facts({ canceled: true }), fake)).toEqual({ ignore: 'canceled' })
    expect(resolveDrop(facts({ source: null }), fake)).toEqual({ ignore: 'no source' })
    expect(resolveDrop(facts({ overTarget: false }), fake)).toEqual({ ignore: 'dropped outside' })
    expect(resolveDrop(facts({ placement: null }), fake)).toEqual({ ignore: 'unchanged' })
  })
  it('an incompatible destination is reported with the adapter reason and produces no request', () => {
    expect(resolveDrop(facts({ placement: { containerId: 'c:three', index: 0 } }), fake)).toEqual({ ignore: 'Not allowed here.' })
  })
})
