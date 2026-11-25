import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { goTo } from '../../test/shell'
import { stubViewport } from '../../test/viewport'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import EditorShell from './EditorShell'

/* UI-027: inspector hide/show, toolbar Add component / Templates, and Back to properties. */

const editor = () => useEditorStore.getState()
let viewport: ReturnType<typeof stubViewport>

function load() {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Shell',
    sections: [
      { id: 's1', kind: 'grid', title: 'Main', widgets: [{ id: 'w1', type: 'notes', title: 'Plain' }, { id: 'w2', type: 'tasks', title: 'Todo' }], layout: [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }, { i: 'w2', x: 6, y: 0, w: 6, h: 4 }] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  viewport = stubViewport(true)
  load()
})
afterEach(() => viewport.restore())

const toolbar = () => within(document.querySelector('[data-toolbar]') as HTMLElement)
const inspectorEl = () => screen.queryByRole('complementary', { name: 'Inspector' })
const gridClass = () => (document.querySelector('#workspace-canvas') as HTMLElement).parentElement!.className

describe('inspector hide and show', () => {
  it('hides the column, widens the canvas, and reopens with the same selection, view and draft', async () => {
    render(<EditorShell />)
    const user = userEvent.setup()
    act(() => editor().select({ kind: 'widget', id: 'w2' }))
    await goTo(user, 'Appearance')
    const draft = editor().draftConfig
    const history = editor().history
    expect(gridClass()).toContain('lg:grid-cols-[minmax(0,1fr)_calc(17.5rem+3rem)]')
    const toggle = toolbar().getByRole('button', { name: 'Hide inspector' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(inspectorEl()).toBeNull()
    expect(gridClass()).not.toContain('grid-cols')
    expect(toolbar().getByRole('button', { name: 'Show inspector' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Show inspector' })).toHaveFocus() // focus stays on the control that was used
    expect(editor().selection).toEqual({ kind: 'widget', id: 'w2' })
    expect(editor().draftConfig).toBe(draft)
    expect(editor().history).toBe(history)
    expect(selectIsDirty(editor())).toBe(false)
    await user.click(toolbar().getByRole('button', { name: 'Show inspector' }))
    expect(inspectorEl()).not.toBeNull()
    expect(within(inspectorEl()!).getByRole('heading', { name: 'Appearance' })).toBeInTheDocument() // the view was kept
    expect(gridClass()).toContain('grid-cols')
    expect(editor().selection).toEqual({ kind: 'widget', id: 'w2' })
    expect(editor().draftConfig).toBe(draft)
  })

  it('is not offered in Preview, and the inspector is gone there anyway', async () => {
    render(<EditorShell />)
    await userEvent.setup().click(toolbar().getByRole('button', { name: 'Preview' }))
    expect(toolbar().queryByRole('button', { name: /inspector/ })).not.toBeInTheDocument()
    expect(inspectorEl()).toBeNull()
  })

  it('is disabled with a reason while a drag is in progress, and enabled again afterwards', () => {
    render(<EditorShell />)
    act(() => { editor().beginGesture('grid') })
    const toggle = toolbar().getByRole('button', { name: 'Hide inspector' })
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAccessibleDescription('Finish the drag or resize first.')
    act(() => editor().endGesture())
    expect(toolbar().getByRole('button', { name: 'Hide inspector' })).toBeEnabled()
  })

  it('stays hidden while the user keeps editing, and picking a card keeps it hidden', async () => {
    render(<EditorShell />)
    const user = userEvent.setup()
    await user.click(toolbar().getByRole('button', { name: 'Hide inspector' }))
    await user.click(document.querySelector('[data-widget-id="w1"]') as HTMLElement)
    expect(editor().selection).toEqual({ kind: 'widget', id: 'w1' })
    expect(inspectorEl()).toBeNull()
  })
})

describe('toolbar entries and Back to properties', () => {
  it('Add component and Templates open their dialogs from the toolbar, and Escape returns focus to the button', async () => {
    render(<EditorShell />)
    const user = userEvent.setup()
    const add = toolbar().getByRole('button', { name: 'Add component' })
    expect(add).toHaveAttribute('aria-haspopup', 'dialog')
    await user.click(add)
    expect(screen.getByRole('dialog', { name: 'Add a component' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(add).toHaveFocus()
    const templates = toolbar().getByRole('button', { name: 'Templates' })
    await user.click(templates)
    expect(screen.getByRole('dialog', { name: 'Templates' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(templates).toHaveFocus()
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('Add and Templates are unavailable, with a reason, while the latest saved workspace is loading', () => {
    render(<EditorShell />)
    act(() => { editor().beginReload() })
    const add = toolbar().getByRole('button', { name: 'Add component' })
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription('The latest saved workspace is loading.')
    expect(toolbar().getByRole('button', { name: 'Templates' })).toBeDisabled()
  })

  it('every non-Properties view has Back to properties, which keeps the selection', async () => {
    render(<EditorShell />)
    const user = userEvent.setup()
    act(() => editor().select({ kind: 'widget', id: 'w1' }))
    for (const view of ['Appearance', 'Outline'] as const) {
      const panel = await goTo(user, view)
      await user.click(panel.getByRole('button', { name: 'Back to properties' }))
      expect(within(inspectorEl()!).getByRole('heading', { name: 'Properties' })).toBeInTheDocument()
      expect(inspectorEl()).not.toHaveTextContent('Back to properties')
      expect(editor().selection).toEqual({ kind: 'widget', id: 'w1' })
    }
  })

  it('clicking a card on the canvas returns the inspector to its Properties even when it was already selected', async () => {
    render(<EditorShell />)
    const user = userEvent.setup()
    act(() => editor().select({ kind: 'widget', id: 'w1' }))
    await goTo(user, 'Outline')
    expect(within(inspectorEl()!).getByRole('heading', { name: 'Outline' })).toBeInTheDocument()
    await user.click(document.querySelector('[data-widget-id="w1"]') as HTMLElement)
    expect(within(inspectorEl()!).getByRole('heading', { name: 'Properties' })).toBeInTheDocument()
  })
})
