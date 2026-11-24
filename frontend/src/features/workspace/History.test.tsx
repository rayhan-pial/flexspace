import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTheme } from '../../domain/workspace/commands'
import App from '../../app/App'
import { installFetch } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { stubViewport } from '../../test/viewport'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import { goTo, inspector } from '../../test/shell'

const editor = () => useEditorStore.getState()

const OWN = {
  schemaVersion: 1,
  title: 'Ada workspace',
  navigation: { placement: 'left', primaryItems: [{ id: 'nav-own', label: 'Mine', targetSectionId: 's-own', icon: 'home' }], secondaryItems: [] },
  sections: [
    { id: 's-own', kind: 'stack', title: 'My section', widgets: [{ id: 'n-own', type: 'notes', title: 'Meeting notes', props: { body: 'Original note' } }] },
  ],
}

let server: FakeServer
let viewport: ReturnType<typeof stubViewport>

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  server = createFakeServer({ a: 'Ada workspace' }, { a: OWN })
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
const settings = inspector

async function openTemplates(user: ReturnType<typeof userEvent.setup>) {
  await goTo(user, 'Templates')
  await settings().findByText(/Start from a ready-made design/)
}
const sectionTitles = () => editor().draftConfig!.sections.map((s) => s.title)
const allDraftIds = () => {
  const ids: string[] = []
  const draft = editor().draftConfig!
  for (const item of [...draft.navigation.primaryItems, ...draft.navigation.secondaryItems]) ids.push(item.id)
  for (const section of draft.sections) {
    ids.push(section.id)
    for (const widget of section.widgets) ids.push(widget.id)
  }
  return ids
}
const saveStatus = () => screen.getByRole('status', { name: 'Save status' })

const undoButton = () => screen.getByRole('button', { name: 'Undo' })
const redoButton = () => screen.getByRole('button', { name: 'Redo' })
const notes = () => screen.getByLabelText('Meeting notes text') as HTMLTextAreaElement

describe('Undo and Redo buttons', () => {
  it('start disabled, and enable after a change', async () => {
    const user = await open()
    expect(undoButton()).toBeDisabled()
    expect(redoButton()).toBeDisabled()
    await user.type(notes(), '!')
    expect(undoButton()).toBeEnabled()
    expect(redoButton()).toBeDisabled()
  })

  it('typing in one field is one step: a single Undo takes back everything typed there', async () => {
    const user = await open()
    await user.type(notes(), ' plus a longer edit')
    expect(notes()).toHaveValue('Original note plus a longer edit')
    await user.click(undoButton())
    expect(notes()).toHaveValue('Original note')
    expect(undoButton()).toBeDisabled()
    expect(selectIsDirty(editor())).toBe(false)
    await user.click(redoButton())
    expect(notes()).toHaveValue('Original note plus a longer edit')
    expect(redoButton()).toBeDisabled()
  })

  it('editing two different fields makes two steps', async () => {
    const user = await open()
    await user.type(notes(), ' one')
    const title = screen.getByLabelText('Workspace title')
    await user.type(title, ' two')
    expect(editor().draftConfig!.title).toBe('Ada workspace two')
    await user.click(undoButton())
    expect(editor().draftConfig!.title).toBe('Ada workspace')
    expect(notes()).toHaveValue('Original note one')
    await user.click(undoButton())
    expect(notes()).toHaveValue('Original note')
  })

  it('focusing a field again after leaving it starts a new step', async () => {
    const user = await open()
    await user.type(notes(), ' a')
    await user.click(screen.getByLabelText('Workspace title'))
    await user.type(notes(), ' b')
    await user.click(undoButton())
    expect(notes()).toHaveValue('Original note a')
  })

  it('never contacts the server', async () => {
    const user = await open()
    const requests = server.gets
    await user.type(notes(), 'xyz')
    await user.click(undoButton())
    await user.click(redoButton())
    await user.click(undoButton())
    expect(server.puts).toHaveLength(0)
    expect(server.gets).toBe(requests)
    expect(server.templateListGets).toBe(0)
  })

  it('announces what it did in a status region', async () => {
    const user = await open()
    await user.type(notes(), 'x')
    await user.click(undoButton())
    expect(screen.getByRole('status', { name: 'History status' })).toHaveTextContent('Undid the last change.')
    await user.click(redoButton())
    expect(screen.getByRole('status', { name: 'History status' })).toHaveTextContent('Redid the change.')
  })

  it('is not offered in Preview', async () => {
    const user = await open()
    await user.type(notes(), '!')
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Redo' })).not.toBeInTheDocument()
  })
})

describe('colour picking', () => {
  it('one drag of the colour picker is one step, however many colours it passes through', async () => {
    const user = await open()
    await goTo(user, 'Appearance')
    await user.click(settings().getAllByRole('button', { name: /^Pick/ })[0])
    const picker = document.querySelector('.react-colorful') as HTMLElement
    expect(picker).not.toBeNull()
    const before = editor().draftConfig!.theme.primary
    fireEvent.pointerDown(picker)
    for (const color of ['#112233', '#223344', '#334455', '#445566']) act(() => void editor().apply(setTheme({ primary: color })))
    fireEvent.pointerUp(window)
    expect(editor().draftConfig!.theme.primary).toBe('#445566')
    await user.click(undoButton())
    expect(editor().draftConfig!.theme.primary).toBe(before)
    expect(undoButton()).toBeDisabled()
  })
})

describe('keyboard shortcuts', () => {
  it('Ctrl+Z undoes and Ctrl+Shift+Z redoes when focus is outside a text field', async () => {
    const user = await open()
    await user.type(notes(), ' edit')
    await user.click(document.body)
    await user.keyboard('{Control>}z{/Control}')
    expect(notes()).toHaveValue('Original note')
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(notes()).toHaveValue('Original note edit')
    await user.keyboard('{Control>}z{/Control}')
    await user.keyboard('{Control>}y{/Control}')
    expect(notes()).toHaveValue('Original note edit')
  })

  it('leaves Ctrl+Z to the text field while typing in it', async () => {
    const user = await open()
    await user.type(notes(), ' edit')
    await user.keyboard('{Control>}z{/Control}')
    expect(editor().history.past).toHaveLength(1) // our history was not consulted
    expect(notes()).toHaveValue('Original note edit')
  })

  it('does nothing in Preview', async () => {
    const user = await open()
    await user.type(notes(), ' edit')
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await user.keyboard('{Control>}z{/Control}')
    expect(editor().draftConfig!.sections[0].widgets[0].props.body).toBe('Original note edit')
  })
})

describe('with templates, Save and Cancel', () => {
  it('applying a template is one step, and Undo brings back the previous workspace with its ids', async () => {
    const user = await open()
    const idsBefore = allDraftIds()
    await openTemplates(user)
    await user.click(settings().getByRole('radio', { name: /Creative/ }))
    await user.click(await settings().findByRole('button', { name: 'Apply Creative' }))
    await settings().findByText(/Creative is now in your draft/)
    expect(sectionTitles()).toEqual(['Studio', 'Ideas', 'Archive'])
    await user.click(undoButton())
    expect(sectionTitles()).toEqual(['My section'])
    expect(allDraftIds()).toEqual(idsBefore)
    expect(selectIsDirty(editor())).toBe(false)
    await user.click(redoButton())
    expect(sectionTitles()).toEqual(['Studio', 'Ideas', 'Archive'])
  })

  it('after a Save, Undo is still there and makes the workspace unsaved again', async () => {
    const user = await open()
    await user.type(notes(), ' kept')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
    expect(undoButton()).toBeEnabled()
    await user.click(undoButton())
    expect(notes()).toHaveValue('Original note')
    expect(saveStatus()).toHaveTextContent('Unsaved changes')
    expect(server.puts).toHaveLength(1) // Undo itself sent nothing
  })

  it('Cancel clears the history: both buttons are disabled afterwards', async () => {
    const user = await open()
    await user.type(notes(), ' edit')
    await user.click(undoButton())
    await user.type(notes(), ' again')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(notes()).toHaveValue('Original note')
    expect(undoButton()).toBeDisabled()
    expect(redoButton()).toBeDisabled()
  })

  it('Undo is unavailable while the session is frozen', async () => {
    const user = await open()
    await user.type(notes(), ' edit')
    act(() => editor().freeze())
    expect(undoButton()).toBeDisabled()
    expect(editor().undo()).toBe(false)
  })
})
