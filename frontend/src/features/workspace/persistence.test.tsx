import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { installFetch } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { useSessionStore } from '../auth/sessionStore'
import { useEditorStore } from '../editor/editorStore'

const PASSWORD = 'correct horse battery'

const UNKNOWN_WIDGET = {
  id: 'u1', type: 'kanban', title: 'Board', hidden: false,
  appearance: { anything: 'goes', nested: { x: 1 } },
  props: { columns: [{ name: 'Todo', cards: [1, 2, { deep: null }] }], flag: true },
}
const HIDDEN_NOTE = { id: 'n-hidden', type: 'notes', title: 'Hidden', hidden: true, appearance: {}, props: { body: 'still here' } }

const config = {
  schemaVersion: 1,
  title: 'Ada workspace',
  sections: [
    {
      id: 's-main', kind: 'grid', title: 'Overview',
      widgets: [
        { id: 'n1', type: 'notes', title: 'Meeting notes', props: { body: 'Original note' } },
        UNKNOWN_WIDGET,
        HIDDEN_NOTE,
      ],
      layout: [
        { i: 'n1', x: 0, y: 0, w: 6, h: 4 },
        { i: 'u1', x: 6, y: 0, w: 4, h: 3 },
        { i: 'n-hidden', x: 0, y: 4, w: 4, h: 3 },
      ],
    },
  ],
}

let server: FakeServer

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  server = createFakeServer({ a: 'Ada workspace', b: 'Bea workspace' }, { a: config })
  server.session = 'a'
  installFetch(server.handlers)
})
afterEach(() => vi.unstubAllGlobals())

const note = () => screen.findByLabelText('Meeting notes text') as Promise<HTMLTextAreaElement>
const save = () => screen.getByRole('button', { name: 'Save' })
const saved = () => waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
const storedSection = () => (server.users.a.config as { sections: Array<{ widgets: Array<Record<string, unknown>> }> }).sections[0]

async function logOutAndIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByRole('heading', { name: 'Sign in to your workspace' })
  await user.type(screen.getByLabelText('Email'), 'a@example.com')
  await user.type(screen.getByLabelText('Password'), PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('first complete persistence demonstration', () => {
  it('edit a note, Save, log out, log in: the same text comes back', async () => {
    render(<App />)
    const user = userEvent.setup()
    const textarea = await note()
    expect(textarea).toHaveValue('Original note')

    await user.clear(textarea)
    await user.type(textarea, 'Edited before saving')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await user.click(save())
    await saved()
    expect(storedSection().widgets[0].props).toEqual({ body: 'Edited before saving' })

    await logOutAndIn(user)
    expect(await note()).toHaveValue('Edited before saving')
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(screen.getByText('Saved revision 2')).toBeInTheDocument()
  })

  it('Cancel restores the saved note and nothing reaches the server', async () => {
    render(<App />)
    const user = userEvent.setup()
    const textarea = await note()
    await user.type(textarea, ' plus unsaved words')
    expect(textarea).toHaveValue('Original note plus unsaved words')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(await note()).toHaveValue('Original note')
    expect(server.puts).toHaveLength(0)
    expect(storedSection().widgets[0].props).toEqual({ body: 'Original note' })
  })

  it('a canceled edit never appears after the next login', async () => {
    render(<App />)
    const user = userEvent.setup()
    await user.type(await note(), ' canceled words')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    await logOutAndIn(user)
    expect(await note()).toHaveValue('Original note')
  })

  it('an unsaved edit discarded by logging out is gone after login', async () => {
    render(<App />)
    const user = userEvent.setup()
    await user.type(await note(), ' never saved')
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.click(screen.getByRole('button', { name: 'Discard and log out' }))
    await screen.findByRole('heading', { name: 'Sign in to your workspace' })
    expect(screen.queryByDisplayValue(/never saved/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Email'), 'a@example.com')
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await note()).toHaveValue('Original note')
    expect(server.puts).toHaveLength(0)
  })

  it('unknown and hidden widgets survive an unrelated Save exactly as stored', async () => {
    render(<App />)
    const user = userEvent.setup()
    const title = await screen.findByLabelText('Workspace title')
    await user.clear(title)
    await user.type(title, 'Renamed workspace')
    await user.click(save())
    await saved()

    expect((server.users.a.config as { title: string }).title).toBe('Renamed workspace')
    const widgets = storedSection().widgets
    expect(widgets.find((w) => w.id === 'u1')).toEqual(UNKNOWN_WIDGET)
    expect(widgets.find((w) => w.id === 'n-hidden')).toEqual(HIDDEN_NOTE)
    // The page itself never showed the unknown widget's data.
    expect(document.body.textContent).not.toContain('Todo')
    expect(screen.getByText('Unsupported widget')).toBeInTheDocument()
  })

  it('unknown widgets also survive a note edit and the following reload', async () => {
    render(<App />)
    const user = userEvent.setup()
    await user.type(await note(), '!')
    await user.click(save())
    await saved()
    await logOutAndIn(user)
    await note()
    expect(storedSection().widgets.find((w) => w.id === 'u1')).toEqual(UNKNOWN_WIDGET)
    expect(screen.getByText('Unsupported widget')).toBeInTheDocument()
  })

  it('keeps two accounts independent: another user never sees the edited note', async () => {
    render(<App />)
    const user = userEvent.setup()
    await user.type(await note(), ' A only')
    await user.click(save())
    await saved()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await screen.findByRole('heading', { name: 'Sign in to your workspace' })
    await user.type(screen.getByLabelText('Email'), 'b@example.com')
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByLabelText('Workspace title')).toHaveValue('Bea workspace')
    expect(screen.queryByLabelText('Meeting notes text')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('A only')
  })
})
