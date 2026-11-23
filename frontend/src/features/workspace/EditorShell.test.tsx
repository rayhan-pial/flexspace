import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { removeWidget, setWidgetHidden } from '../../domain/workspace/lifecycle'
import { installFetch } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { stubViewport } from '../../test/viewport'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'

const editor = () => useEditorStore.getState()

const config = {
  schemaVersion: 1,
  title: 'Ada workspace',
  navigation: { placement: 'left', primaryItems: [{ id: 'nav-1', label: 'Overview', targetSectionId: 's-main' }], secondaryItems: [] },
  sections: [
    {
      id: 's-main', kind: 'grid', title: 'Overview',
      widgets: [
        { id: 'n1', type: 'notes', title: 'Meeting notes', props: { body: 'Original note' } },
        { id: 'w1', type: 'welcome', title: 'Welcome card', props: { greeting: 'Hi' } },
        { id: 'u1', type: 'kanban', title: '', props: { x: 1 } },
      ],
      layout: [
        { i: 'n1', x: 0, y: 0, w: 6, h: 4 }, { i: 'w1', x: 6, y: 0, w: 6, h: 3 }, { i: 'u1', x: 0, y: 4, w: 4, h: 3 },
      ],
    },
    { id: 's-stack', kind: 'stack', title: 'Reference', widgets: [{ id: 'n-hidden', type: 'notes', title: 'Hidden note', hidden: true, props: { body: 'hidden body' } }] },
    { id: 's-hidden', kind: 'stack', title: 'Secret section', hidden: true },
  ],
}

let server: FakeServer
let viewport: ReturnType<typeof stubViewport>

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  server = createFakeServer({ a: 'Ada workspace', b: 'Bea workspace' }, { a: config })
  server.session = 'a'
  installFetch(server.handlers)
  viewport = stubViewport(true)
})
afterEach(() => {
  viewport.restore()
  vi.unstubAllGlobals()
})

async function open() {
  render(<App />)
  await screen.findByLabelText('Meeting notes text')
  return userEvent.setup()
}

const outline = () => within(screen.getByRole('list', { name: 'Components' }))
const canvasCard = (id: string) => document.querySelector(`[data-widget-id="${id}"]`) as HTMLElement | null
const settings = () => within(screen.getByRole('complementary', { name: 'Settings panel' }))
const hasPanels = () => !!screen.queryByRole('complementary', { name: 'Components panel' }) || !!screen.queryByRole('complementary', { name: 'Settings panel' })

describe('Edit mode on desktop', () => {
  it('shows the toolbar, both builder panels and the canvas', async () => {
    await open()
    expect(screen.getByRole('complementary', { name: 'Components panel' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Settings panel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByLabelText('Workspace title')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit workspace' })).not.toBeInTheDocument()
  })

  it('offers the panel slots as tabs', async () => {
    const user = await open()
    const left = within(screen.getByRole('complementary', { name: 'Components panel' }))
    expect(left.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true')
    await user.click(left.getByRole('tab', { name: 'Library' }))
    expect(left.getByRole('list', { name: 'Component library' })).toBeInTheDocument()
    expect(settings().getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true')
    await user.click(settings().getByRole('tab', { name: 'Theme' }))
    expect(settings().getByLabelText('Primary color')).toBeInTheDocument()
    await user.click(settings().getByRole('tab', { name: 'Templates' }))
    expect(settings().getByText('Templates will appear here.')).toBeInTheDocument()
  })
})

describe('Preview mode', () => {
  it('hides builder panels, handles, title field and Save/Cancel, and keeps an Edit workspace entry point', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(hasPanels()).toBe(false)
    expect(screen.queryByLabelText('Workspace title')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ada workspace', level: 1 })).toBeInTheDocument()
    expect(canvasCard('n1')).not.toHaveAttribute('tabindex') // no selection handles on the canvas
    await user.click(screen.getByRole('button', { name: 'Edit workspace' }))
    expect(hasPanels()).toBe(true)
    expect(screen.getByLabelText('Workspace title')).toBeInTheDocument()
  })

  it('switching modes keeps the draft untouched and sends nothing to the server', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), ' plus edit')
    const draft = editor().draftConfig
    const saved = editor().savedConfig
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await user.click(screen.getByRole('button', { name: 'Edit workspace' }))
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await user.click(screen.getByRole('button', { name: 'Edit workspace' }))
    expect(editor().draftConfig).toBe(draft)
    expect(editor().savedConfig).toBe(saved)
    expect(selectIsDirty(editor())).toBe(true)
    expect(screen.getByLabelText('Meeting notes text')).toHaveValue('Original note plus edit')
    expect(server.puts).toHaveLength(0)
    expect(server.gets).toBe(1) // only the initial load
  })

  it('note edits in Preview change the same draft and point the user to Edit for Save/Cancel', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await user.type(screen.getByLabelText('Meeting notes text'), '!')
    expect(editor().draftConfig!.sections[0].widgets[0].props).toEqual({ body: 'Original note!' })
    expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Unsaved changes. Switch to Edit to save or cancel them.')
    await user.click(screen.getByRole('button', { name: 'Edit workspace' }))
    expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Unsaved changes')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
    expect(server.puts).toHaveLength(1)
  })
})

describe('component outline', () => {
  it('lists every section and widget, including hidden ones and unsupported types', async () => {
    await open()
    const list = outline()
    for (const name of ['Overview', 'Reference', 'Secret section', 'Meeting notes', 'Welcome card', 'Hidden note', 'Unsupported: kanban']) {
      expect(list.getByRole('button', { name: new RegExp(`^${name}`) })).toBeInTheDocument()
    }
    expect(list.getByRole('button', { name: /Hidden note/ })).toHaveTextContent('hidden')
    expect(list.getByRole('button', { name: /Secret section/ })).toHaveTextContent('hidden')
    // ...although the canvas skips them
    expect(canvasCard('n-hidden')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Secret section' })).not.toBeInTheDocument()
  })
})

describe('selection synchronization', () => {
  it('selecting in the outline selects on the canvas and fills the inspector', async () => {
    const user = await open()
    await user.click(outline().getByRole('button', { name: 'Meeting notes' }))
    expect(editor().selection).toEqual({ kind: 'widget', id: 'n1' })
    expect(canvasCard('n1')).toHaveAttribute('data-selected', 'true')
    expect(outline().getByRole('button', { name: 'Meeting notes' })).toHaveAttribute('aria-current', 'true')
    expect(settings().getByRole('heading', { name: 'Meeting notes' })).toBeInTheDocument()
    expect(settings().getByText('Notes')).toBeInTheDocument()
    expect(settings().getByText('Visible')).toBeInTheDocument()
  })

  it('selecting on the canvas highlights the outline and updates the inspector', async () => {
    const user = await open()
    await user.click(screen.getByRole('heading', { name: 'Welcome card', level: 3 }))
    expect(outline().getByRole('button', { name: 'Welcome card' })).toHaveAttribute('aria-current', 'true')
    expect(outline().getByRole('button', { name: 'Meeting notes' })).not.toHaveAttribute('aria-current')
    expect(settings().getByRole('heading', { name: 'Welcome card' })).toBeInTheDocument()
    await user.click(screen.getByRole('heading', { name: 'Meeting notes', level: 3 }))
    expect(settings().getByRole('heading', { name: 'Meeting notes' })).toBeInTheDocument()
    expect(canvasCard('w1')).not.toHaveAttribute('data-selected')
  })

  it('selecting a section shows its details', async () => {
    const user = await open()
    await user.click(outline().getByRole('button', { name: 'Overview' }))
    expect(editor().selection).toEqual({ kind: 'section', id: 's-main' })
    expect(settings().getByText('Dashboard grid')).toBeInTheDocument()
    expect(settings().getByText('3')).toBeInTheDocument()
  })

  it('an unsupported widget can be selected and says so', async () => {
    const user = await open()
    await user.click(outline().getByRole('button', { name: 'Unsupported: kanban' }))
    expect(settings().getByText('Unsupported (kanban)')).toBeInTheDocument()
  })

  it('with nothing selected the inspector asks for a selection', async () => {
    await open()
    expect(settings().getByText(/Select a component on the canvas or in the outline/)).toBeInTheDocument()
  })

  it('a hidden widget selected from the outline keeps a valid inspector but has no canvas card', async () => {
    const user = await open()
    await user.click(outline().getByRole('button', { name: /Hidden note/ }))
    expect(settings().getByRole('heading', { name: 'Hidden note' })).toBeInTheDocument()
    expect(settings().getByText('Hidden')).toBeInTheDocument()
    expect(canvasCard('n-hidden')).toBeNull()
  })

  it('hiding the selected widget keeps it selected; the inspector reports it hidden', async () => {
    const user = await open()
    await user.click(outline().getByRole('button', { name: 'Welcome card' }))
    act(() => { editor().apply(setWidgetHidden('w1', true)) })
    expect(canvasCard('w1')).toBeNull()
    expect(settings().getByRole('heading', { name: 'Welcome card' })).toBeInTheDocument()
    expect(settings().getByText('Hidden')).toBeInTheDocument()
    expect(outline().getByRole('button', { name: /Welcome card/ })).toHaveAttribute('aria-current', 'true')
  })

  it('removing the selected widget clears the selection, inspector and outline entry', async () => {
    const user = await open()
    await user.click(outline().getByRole('button', { name: 'Welcome card' }))
    expect(settings().getByRole('heading', { name: 'Welcome card' })).toBeInTheDocument()
    act(() => { editor().apply(removeWidget('w1')) })
    expect(editor().selection).toBeNull()
    expect(settings().queryByRole('heading', { name: 'Welcome card' })).not.toBeInTheDocument()
    expect(settings().getByText(/Select a component/)).toBeInTheDocument()
    expect(outline().queryByRole('button', { name: /Welcome card/ })).not.toBeInTheDocument()
    expect(canvasCard('w1')).toBeNull()
  })

  it('Cancel clears the selection and the inspector together', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), '!')
    expect(editor().selection).toEqual({ kind: 'widget', id: 'n1' }) // typing in the note selected it
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(editor().selection).toBeNull()
    expect(settings().getByText(/Select a component/)).toBeInTheDocument()
  })

  it('the selection ring disappears in Preview and is back after returning to Edit', async () => {
    const user = await open()
    await user.click(outline().getByRole('button', { name: 'Meeting notes' }))
    expect(canvasCard('n1')).toHaveAttribute('data-selected', 'true')
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(canvasCard('n1')).not.toHaveAttribute('data-selected')
    await user.click(screen.getByRole('button', { name: 'Edit workspace' }))
    expect(canvasCard('n1')).toHaveAttribute('data-selected', 'true')
  })
})

describe('below desktop width', () => {
  beforeEach(() => viewport.set(false))

  it('shows a Preview with an explanation instead of builder controls', async () => {
    await open()
    expect(screen.getByRole('note')).toHaveTextContent('Editing layout and properties needs a screen at least 1024 px wide')
    expect(hasPanels()).toBe(false)
    expect(screen.queryByRole('button', { name: 'Edit workspace' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Workspace title')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ada workspace', level: 1 })).toBeInTheDocument()
  })

  it('still lets the user read and use notes, and points to a larger screen for saving', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), '!')
    expect(editor().draftConfig!.sections[0].widgets[0].props).toEqual({ body: 'Original note!' })
    expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Open this workspace on a larger screen to save or cancel them.')
  })

  it('does not select widgets', async () => {
    const user = await open()
    await user.click(screen.getByRole('heading', { name: 'Meeting notes', level: 3 }))
    expect(editor().selection).toBeNull()
    expect(canvasCard('n1')).not.toHaveAttribute('data-selected')
  })

  it('does not change the stored mode, so widening restores the editor with the draft intact', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), '!')
    expect(editor().mode).toBe('edit')
    act(() => viewport.set(true))
    expect(await screen.findByRole('complementary', { name: 'Components panel' })).toBeInTheDocument()
    expect(screen.getByLabelText('Meeting notes text')).toHaveValue('Original note!')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('a user who chose Preview on desktop stays in Preview after resizing', async () => {
    viewport.set(true)
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    act(() => viewport.set(false))
    expect(screen.getByRole('note')).toBeInTheDocument()
    act(() => viewport.set(true))
    expect(await screen.findByRole('button', { name: 'Edit workspace' })).toBeInTheDocument()
    expect(hasPanels()).toBe(false)
  })

  it('narrowing the window while editing hides the panels without losing anything', async () => {
    viewport.set(true)
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), '!')
    const draft = editor().draftConfig
    act(() => viewport.set(false))
    expect(hasPanels()).toBe(false)
    expect(editor().draftConfig).toBe(draft)
    expect(server.puts).toHaveLength(0)
  })
})

describe('browser storage', () => {
  it('mode changes, selection and resizing never touch web storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const user = await open()
    await user.click(outline().getByRole('button', { name: 'Meeting notes' }))
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    act(() => viewport.set(false))
    act(() => viewport.set(true))
    expect(setItem).not.toHaveBeenCalled()
  })
})
