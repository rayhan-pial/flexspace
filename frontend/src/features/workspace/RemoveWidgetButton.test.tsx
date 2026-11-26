import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { stubViewport } from '../../test/viewport'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import EditorShell from './EditorShell'

const editor = () => useEditorStore.getState()
let viewport: ReturnType<typeof stubViewport>

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  viewport = stubViewport(true)
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Remove',
    sections: [
      { id: 'g', kind: 'grid', title: 'Grid', widgets: [{ id: 'w1', type: 'notes', title: 'Grid note' }], layout: [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }] },
      { id: 's', kind: 'stack', title: 'Stack', widgets: [{ id: 'w2', type: 'notes', title: 'Stack note' }] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
})
afterEach(() => viewport.restore())

const ids = () => editor().draftConfig!.sections.flatMap((s) => s.widgets.map((w) => w.id))

describe('Remove on the card', () => {
  it.each([['Grid note', 'w1'], ['Stack note', 'w2']])('removes %s after a confirmation, as one undoable change', async (title, id) => {
    render(<EditorShell />)
    const user = userEvent.setup()
    await user.click(within(screen.getByRole('article', { name: title })).getByRole('button', { name: `Remove ${title}` }))
    await user.click(within(screen.getByRole('alertdialog', { name: 'Remove this widget?' })).getByRole('button', { name: /Keep|Cancel/ }))
    expect(ids()).toContain(id) // declining removes nothing
    expect(selectIsDirty(editor())).toBe(false)
    await user.click(within(screen.getByRole('article', { name: title })).getByRole('button', { name: `Remove ${title}` }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove widget' }))
    expect(ids()).not.toContain(id)
    expect(editor().history.past).toHaveLength(1)
    act(() => { editor().undo() })
    expect(ids()).toContain(id)
  })

  it('is absent in Preview', () => {
    render(<EditorShell />)
    act(() => editor().setMode('preview'))
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })

  it('cards advertise that they can be grabbed, and the grid keyboard grip is hidden until focused', () => {
    render(<EditorShell />)
    expect(screen.getByRole('article', { name: 'Stack note' }).className).toContain('cursor-grab')
    expect(screen.getByRole('button', { name: /^Move or resize Grid note/ }).className).toContain('sr-only')
  })
})
