import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { apiError, deferred, installFetch, json } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { stubViewport } from '../../test/viewport'
import { useSessionStore } from '../auth/sessionStore'
import { useEditorStore } from '../editor/editorStore'

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
const settings = () => within(screen.getByRole('complementary', { name: 'Settings panel' }))

async function openTemplates(user: ReturnType<typeof userEvent.setup>) {
  await user.click(settings().getByRole('tab', { name: 'Templates' }))
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

const MINE = { schemaVersion: 1, title: 'Saved layout', sections: [{ id: 'sec-mine', kind: 'stack', title: 'Mine', widgets: [{ id: 'wid-mine', type: 'notes', title: 'Mine notes', props: { body: 'From template' } }] }] }
const own = (id: string, name: string, owner: string, config: unknown = MINE) => ({ id, name, kind: 'custom' as const, updatedAt: '2026-11-23T09:30:00Z', config, owner })

async function saveAs(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(settings().getByLabelText('Template name'), name)
  await user.click(settings().getByRole('button', { name: 'Save current design as template' }))
}

describe('saving a snapshot', () => {
  it('shows an empty state and keeps the save button disabled until there is a name', async () => {
    const user = await open()
    await openTemplates(user)
    expect(settings().getByText(/You have no saved templates yet/)).toBeInTheDocument()
    const button = settings().getByRole('button', { name: 'Save current design as template' })
    expect(button).toBeDisabled()
    await user.type(settings().getByLabelText('Template name'), '   ')
    expect(button).toBeDisabled()
    await user.type(settings().getByLabelText('Template name'), 'Ok')
    expect(button).toBeEnabled()
  })

  it('stores the draft, including unsaved edits, and changes neither revision, baseline nor draft', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), ' plus edit')
    await openTemplates(user)
    const draft = editor().draftConfig
    const saved = editor().savedConfig
    await saveAs(user, '  My snapshot  ')

    await settings().findByText(/Saved "My snapshot" to your templates/)
    expect(server.templatePosts).toHaveLength(1)
    expect(server.templatePosts[0].name).toBe('My snapshot')
    expect(server.templatePosts[0].csrf).toBe('csrf-a')
    expect(JSON.stringify(server.templatePosts[0].config)).toContain('Original note plus edit')
    expect(server.puts).toHaveLength(0)
    expect(editor().revision).toBe(1)
    expect(editor().savedConfig).toBe(saved)
    expect(editor().draftConfig).toBe(draft)
    expect(saveStatus()).toHaveTextContent('Unsaved changes')
    expect(settings().getByRole('radio', { name: /My snapshot/ })).toBeInTheDocument()
    expect(settings().queryByText(/You have no saved templates yet/)).not.toBeInTheDocument()
    expect(settings().getByLabelText('Template name')).toHaveValue('')
  })

  it('reports a failed save and adds nothing', async () => {
    server.templateHook = (call) => (call.method === 'POST' ? apiError(500, 'server_error', 'Boom') : undefined)
    const user = await open()
    await openTemplates(user)
    await saveAs(user, 'Broken')
    expect(await settings().findByRole('alert')).toHaveTextContent(/the template wasn't saved/)
    expect(settings().queryByRole('radio', { name: /Broken/ })).not.toBeInTheDocument()
    expect(settings().getByLabelText('Template name')).toHaveValue('Broken') // kept so the user can retry
  })

  it('an expired session while saving hands over to re-authentication', async () => {
    server.templateHook = (call) => (call.method === 'POST' ? apiError(401, 'unauthenticated', 'Sign in') : undefined)
    const user = await open()
    await openTemplates(user)
    await saveAs(user, 'Late')
    await waitFor(() => expect(useSessionStore.getState().status).toBe('reauth'))
  })

  it('cannot be submitted twice while the first request is running', async () => {
    const hold = deferred<Response>()
    server.templateHook = (call) => (call.method === 'POST' ? hold.promise : undefined)
    const user = await open()
    await openTemplates(user)
    await saveAs(user, 'Once')
    await waitFor(() => expect(settings().getByRole('button', { name: 'Save current design as template' })).toBeDisabled())
    fireEvent.submit(settings().getByLabelText('Template name').closest('form')!) // bypasses the disabled button
    expect(server.templatePosts).toHaveLength(1)
    hold.resolve(json(201, { id: 'tpl-x', name: 'Once', kind: 'custom', updatedAt: '2026-11-23T10:00:00Z', config: MINE }))
    await settings().findByText(/Saved "Once"/)
  })
})

describe('own templates', () => {
  it('lists only the signed-in user private templates', async () => {
    server.addTemplate(own('tpl-a', 'Ada layout', 'a'))
    server.addTemplate(own('tpl-b', 'Bob secret', 'b'))
    const user = await open()
    await openTemplates(user)
    expect(await settings().findByRole('radio', { name: /Ada layout/ })).toBeInTheDocument()
    expect(settings().queryByRole('radio', { name: /Bob secret/ })).not.toBeInTheDocument()
  })

  it('applies one with fresh ids, as a draft change that Cancel can undo', async () => {
    server.addTemplate(own('tpl-a', 'Ada layout', 'a'))
    const user = await open()
    await openTemplates(user)
    await user.click(await settings().findByRole('radio', { name: /Ada layout/ }))
    await user.click(await settings().findByRole('button', { name: 'Apply Ada layout' }))
    await settings().findByText(/Ada layout is now in your draft/)
    expect(sectionTitles()).toEqual(['Mine'])
    expect(allDraftIds()).not.toContain('sec-mine')
    expect(allDraftIds()).not.toContain('wid-mine')
    expect(server.puts).toHaveLength(0)
    expect(editor().revision).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(sectionTitles()).toEqual(['My section'])
  })

  it('asks before replacing unsaved changes', async () => {
    server.addTemplate(own('tpl-a', 'Ada layout', 'a'))
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), '!')
    await openTemplates(user)
    await user.click(await settings().findByRole('radio', { name: /Ada layout/ }))
    await user.click(await settings().findByRole('button', { name: 'Apply Ada layout' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(sectionTitles()).toEqual(['My section'])
  })

  it('is blocked while a save is in flight', async () => {
    server.addTemplate(own('tpl-a', 'Ada layout', 'a'))
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), '!')
    await openTemplates(user)
    await user.click(await settings().findByRole('radio', { name: /Ada layout/ }))
    await settings().findByRole('button', { name: 'Apply Ada layout' })
    const hold = deferred<Response>()
    server.putHook = () => hold.promise
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(settings().getByRole('button', { name: 'Apply Ada layout' })).toBeDisabled())
    hold.resolve(json(200, { id: 'ws-a', revision: 2, updatedAt: '2026-11-23T10:00:00Z', config: editor().draftConfig }))
    await waitFor(() => expect(settings().getByRole('button', { name: 'Apply Ada layout' })).toBeEnabled())
  })

  it('system templates have no delete control', async () => {
    server.addTemplate(own('tpl-a', 'Ada layout', 'a'))
    const user = await open()
    await openTemplates(user)
    await settings().findByRole('radio', { name: /Ada layout/ })
    expect(settings().getAllByRole('button', { name: /^Delete template/ })).toHaveLength(1)
  })
})

describe('deleting', () => {
  it('asks first, then removes it and clears its preview without touching the workspace', async () => {
    server.addTemplate(own('tpl-a', 'Ada layout', 'a'))
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), '!')
    await openTemplates(user)
    await user.click(await settings().findByRole('radio', { name: /Ada layout/ }))
    await settings().findByRole('button', { name: 'Apply Ada layout' })
    const draft = editor().draftConfig

    await user.click(settings().getByRole('button', { name: 'Delete template Ada layout' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Keep template' }))
    expect(server.templateDeletes).toHaveLength(0)

    await user.click(settings().getByRole('button', { name: 'Delete template Ada layout' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete template' }))
    await settings().findByText(/Deleted "Ada layout"/)
    expect(server.templateDeletes).toEqual(['tpl-a'])
    expect(server.templateDeleteCsrf).toEqual(['csrf-a'])
    expect(settings().queryByRole('radio', { name: /Ada layout/ })).not.toBeInTheDocument()
    expect(settings().queryByRole('button', { name: 'Apply Ada layout' })).not.toBeInTheDocument()
    expect(editor().draftConfig).toBe(draft)
    expect(editor().revision).toBe(1)
    expect(settings().getByText(/You have no saved templates yet/)).toBeInTheDocument()
  })

  it('reports a template that is already gone', async () => {
    server.addTemplate(own('tpl-a', 'Ada layout', 'a'))
    const user = await open()
    await openTemplates(user)
    await settings().findByRole('radio', { name: /Ada layout/ })
    server.templates = server.templates.filter((t) => t.id !== 'tpl-a')
    await user.click(settings().getByRole('button', { name: 'Delete template Ada layout' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete template' }))
    expect(await settings().findByRole('alert')).toHaveTextContent('That template no longer exists.')
  })

  it('a failed delete keeps the template listed', async () => {
    server.addTemplate(own('tpl-a', 'Ada layout', 'a'))
    server.templateHook = (call) => (call.method === 'DELETE' ? apiError(500, 'server_error', 'Boom') : undefined)
    const user = await open()
    await openTemplates(user)
    await settings().findByRole('radio', { name: /Ada layout/ })
    await user.click(settings().getByRole('button', { name: 'Delete template Ada layout' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete template' }))
    expect(await settings().findByRole('alert')).toHaveTextContent(/wasn't deleted/)
    expect(settings().getByRole('radio', { name: /Ada layout/ })).toBeInTheDocument()
  })
})
