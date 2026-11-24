import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { installFetch } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { goTo, inspector } from '../../test/shell'
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
  server = createFakeServer({ a: 'Ada workspace' }, { a: config })
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
const left = inspector
const settings = inspector
const dialog = () => within(screen.getByRole('alertdialog'))
const canvasCard = (id: string) => document.querySelector(`[data-widget-id="${id}"]`) as HTMLElement | null
const widgetsOf = (sectionId: string) => editor().draftConfig!.sections.find((s) => s.id === sectionId)!.widgets

describe('component and section lifecycle', () => {
  it('adds every widget type from the Library, selects the new widget and lists it in the outline', async () => {
    const user = await open()
    await goTo(user, 'Outline')
    await user.click(outline().getByRole('button', { name: 'Overview' }))
    await goTo(user, 'Components')
    expect(left().getByText('Overview', { selector: 'strong' })).toBeInTheDocument()
    for (const label of ['Welcome', 'Tasks', 'Notes', 'Gallery', 'Analytics', 'Calendar']) {
      await user.click(left().getByRole('button', { name: `Add ${label}` }))
    }
    const added = widgetsOf('s-main').slice(3)
    expect(added.map((w) => w.type)).toEqual(['welcome', 'tasks', 'notes', 'gallery', 'analytics', 'calendar'])
    expect(editor().selection).toEqual({ kind: 'widget', id: added[5].id })
    expect(editor().draftConfig!.sections[0].layout).toHaveLength(9)
    await goTo(user, 'Outline')
    expect(outline().getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-current', 'true')
    expect(selectIsDirty(editor())).toBe(true)
  })

  it('shows known widgets whose renderer is not built yet as a card rather than failing', async () => {
    const user = await open()
    await goTo(user, 'Components')
    await user.click(left().getByRole('button', { name: 'Add Gallery' }))
    expect(canvasCard(editor().selection!.id)).not.toBeNull()
  })

  it('hides and shows a widget from the inspector; it stays in the outline while hidden', async () => {
    const user = await open()
    await goTo(user, 'Outline')
    await user.click(outline().getByRole('button', { name: 'Welcome card' }))
    await goTo(user, 'My workspace')
    await user.click(settings().getByRole('button', { name: 'Hide widget' }))
    expect(canvasCard('w1')).toBeNull()
    await goTo(user, 'Outline')
    expect(outline().getByRole('button', { name: /^Welcome card/ })).toHaveTextContent('hidden')
    await goTo(user, 'My workspace')
    await user.click(settings().getByRole('button', { name: 'Show widget' }))
    expect(canvasCard('w1')).not.toBeNull()
    expect(selectIsDirty(editor())).toBe(false) // back to the saved state
  })

  it('removes a widget only after confirmation and cleans its geometry', async () => {
    const user = await open()
    await goTo(user, 'Outline')
    await user.click(outline().getByRole('button', { name: 'Welcome card' }))
    await goTo(user, 'My workspace')
    await user.click(settings().getByRole('button', { name: 'Remove widget' }))
    await user.click(dialog().getByRole('button', { name: 'Keep editing' }))
    expect(widgetsOf('s-main').map((w) => w.id)).toContain('w1')
    await user.click(settings().getByRole('button', { name: 'Remove widget' }))
    await user.click(dialog().getByRole('button', { name: 'Remove widget' }))
    expect(widgetsOf('s-main').map((w) => w.id)).toEqual(['n1', 'u1'])
    expect(editor().draftConfig!.sections[0].layout!.map((r) => r.i)).toEqual(['n1', 'u1'])
    expect(editor().selection).toBeNull()
    expect(settings().getByText(/Select a component/)).toBeInTheDocument()
  })

  it('adds, renames, hides and removes sections; removing one nulls navigation targets', async () => {
    const user = await open()
    await goTo(user, 'Outline')
    await user.click(left().getByRole('button', { name: 'Stack' }))
    const added = editor().draftConfig!.sections.at(-1)!
    expect(added).toMatchObject({ kind: 'stack', title: 'New section', widgets: [] })
    expect(editor().selection).toEqual({ kind: 'section', id: added.id })
    expect(screen.getByText(/This section is empty/)).toBeInTheDocument() // useful empty state

    await goTo(user, 'My workspace')
    const title = settings().getByLabelText('Section title')
    await user.clear(title)
    await user.type(title, 'Plans')
    await goTo(user, 'Outline')
    expect(outline().getByRole('button', { name: 'Plans' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Plans', level: 2 })).toBeInTheDocument()

    await goTo(user, 'My workspace')
    await user.click(settings().getByRole('button', { name: 'Hide section' }))
    expect(screen.queryByRole('heading', { name: 'Plans', level: 2 })).not.toBeInTheDocument()
    await goTo(user, 'Outline')
    expect(outline().getByRole('button', { name: /Plans/ })).toHaveTextContent('hidden')
    await goTo(user, 'My workspace')
    await user.click(settings().getByRole('button', { name: 'Show section' }))

    await goTo(user, 'Outline')
    await user.click(outline().getByRole('button', { name: 'Overview' }))
    await goTo(user, 'My workspace')
    await user.click(settings().getByRole('button', { name: 'Remove section' }))
    await user.click(dialog().getByRole('button', { name: 'Remove section' }))
    expect(editor().draftConfig!.sections.map((s) => s.id)).not.toContain('s-main')
    expect(editor().draftConfig!.navigation.primaryItems).toEqual([
      { id: 'nav-1', label: 'Overview', targetSectionId: null, icon: 'home' },
    ])
  })

  it('shows empty-workspace messages when every section is gone', async () => {
    const user = await open()
    for (const name of ['Overview', 'Reference', 'Secret section']) {
      await goTo(user, 'Outline')
      await user.click(outline().getByRole('button', { name: new RegExp(`^${name}`) }))
      await goTo(user, 'My workspace')
      await user.click(settings().getByRole('button', { name: 'Remove section' }))
      await user.click(dialog().getByRole('button', { name: 'Remove section' }))
    }
    expect(screen.getByText(/This workspace has no sections yet. Add one/)).toBeInTheDocument()
    await goTo(user, 'Components')
    expect(left().getByText(/Add a section in the Outline tab first/)).toBeInTheDocument()
  })

  it('Cancel reverses all lifecycle actions and Save persists them', async () => {
    const user = await open()
    await goTo(user, 'Outline')
    await user.click(outline().getByRole('button', { name: 'Overview' }))
    await goTo(user, 'Components')
    await user.click(left().getByRole('button', { name: 'Add Tasks' }))
    await goTo(user, 'My workspace')
    await user.click(settings().getByRole('button', { name: 'Hide widget' }))
    await goTo(user, 'Outline')
    await user.click(left().getByRole('button', { name: 'Dashboard grid' }))
    expect(selectIsDirty(editor())).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(selectIsDirty(editor())).toBe(false)
    expect(editor().draftConfig!.sections).toHaveLength(3)
    expect(widgetsOf('s-main')).toHaveLength(3)

    await user.click(outline().getByRole('button', { name: 'Overview' }))
    await goTo(user, 'Components')
    await user.click(left().getByRole('button', { name: 'Add Tasks' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
    const saved = server.puts[0].config as { sections: Array<{ id: string; widgets: Array<{ type: string }> }> }
    expect(saved.sections.find((s) => s.id === 's-main')!.widgets.map((w) => w.type)).toEqual(['notes', 'welcome', 'kanban', 'tasks'])
  })

  it('offers no lifecycle controls in Preview', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })
})
