import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { apiError, deferred, installFetch, json } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { stubViewport } from '../../test/viewport'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'

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

describe('listing and previewing', () => {
  it('shows a loading state, then the three ready-made designs with their descriptions', async () => {
    const user = await open()
    await user.click(settings().getByRole('tab', { name: 'Templates' }))
    await settings().findByRole('radio', { name: /Productivity/ })
    expect(settings().getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual([
      expect.stringContaining('Productivity'), expect.stringContaining('Analytics'), expect.stringContaining('Creative'),
    ])
    expect(settings().getByText(/Key metrics and engagement figures/)).toBeInTheDocument()
    expect(server.templateListGets).toBe(1)
    expect(settings().getByText(/Replaces your draft/)).toBeInTheDocument()
  })

  it('previews a design without applying it: theme, navigation, sections and widgets', async () => {
    const user = await open()
    await openTemplates(user)
    const draft = editor().draftConfig
    await user.click(settings().getByRole('radio', { name: /Analytics/ }))
    const preview = await settings().findByRole('region', { name: 'Analytics preview' })
    expect(within(preview).getByText(/3 sections, 9 widgets, navigation in the top bar: Overview, Reports, Notes\./)).toBeInTheDocument()
    expect(within(preview).getByText('Overview', { selector: 'span.font-medium' })).toBeInTheDocument()
    expect(within(preview).getByText(/Key metrics, Engagement, Follow-ups, Reporting calendar/)).toBeInTheDocument()
    expect(within(preview).getByTitle('primary #0ea5e9')).toBeInTheDocument()
    expect(within(preview).getByRole('button', { name: 'Apply Analytics' })).toBeEnabled()
    expect(server.templateDetailGets).toEqual(['tpl-analytics'])
    expect(editor().draftConfig).toBe(draft) // previewing changes nothing
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('shows each design as visually distinct in the preview', async () => {
    const user = await open()
    await openTemplates(user)
    const colours: string[] = []
    for (const name of ['Productivity', 'Analytics', 'Creative']) {
      await user.click(settings().getByRole('radio', { name: new RegExp(name) }))
      const preview = await settings().findByRole('region', { name: `${name} preview` })
      colours.push(within(preview).getByTitle(/^primary /).getAttribute('title')!)
    }
    expect(new Set(colours).size).toBe(3)
  })

  it('a slow response for an earlier choice never overwrites the preview of a later one', async () => {
    const user = await open()
    await openTemplates(user)
    const slow = deferred<Response>()
    const original = server.handlers['GET /templates/tpl-analytics']
    server.handlers['GET /templates/tpl-analytics'] = () => slow.promise
    await user.click(settings().getByRole('radio', { name: /Analytics/ }))
    await user.click(settings().getByRole('radio', { name: /Creative/ }))
    await settings().findByRole('region', { name: 'Creative preview' })
    slow.resolve(await original({ method: 'GET', path: '/templates/tpl-analytics', headers: {}, body: undefined, init: {} }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const creative = settings().getByRole('region', { name: 'Creative preview' })
    // The late Analytics response must not have replaced the CONTENT of the preview (its heading is just the selected name).
    expect(within(creative).getByText(/navigation in the right sidebar: Studio, Ideas, Archive/)).toBeInTheDocument()
    expect(within(creative).queryByText(/navigation in the top bar/)).not.toBeInTheDocument()
    expect(settings().queryByRole('region', { name: 'Analytics preview' })).not.toBeInTheDocument()
  })
})

describe('applying a design', () => {
  it('replaces only the draft: the workspace turns dirty, nothing is sent, and Cancel brings the saved version back', async () => {
    const user = await open()
    await openTemplates(user)
    await user.click(settings().getByRole('radio', { name: /Creative/ }))
    await user.click(await settings().findByRole('button', { name: 'Apply Creative' }))

    await settings().findByText(/Creative is now in your draft\. Save to keep it/)
    expect(sectionTitles()).toEqual(['Studio', 'Ideas', 'Archive'])
    expect(editor().draftConfig!.title).toBe('Creative workspace')
    expect(screen.getByRole('heading', { name: 'Creative workspace', level: 1 })).toBeInTheDocument()
    expect(saveStatus()).toHaveTextContent('Unsaved changes')
    expect(server.puts).toHaveLength(0)
    expect(editor().savedConfig!.title).toBe('Ada workspace') // the saved baseline is untouched
    expect(editor().revision).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(editor().draftConfig!.title).toBe('Ada workspace')
    expect(sectionTitles()).toEqual(['My section'])
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('Save then persists the new design with fresh ids and none of the template ids', async () => {
    const user = await open()
    await openTemplates(user)
    await user.click(settings().getByRole('radio', { name: /Analytics/ }))
    await user.click(await settings().findByRole('button', { name: 'Apply Analytics' }))
    await settings().findByText(/Analytics is now in your draft/)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
    const stored = JSON.stringify(server.users.a.config)
    expect(server.puts).toHaveLength(1)
    expect(stored).toContain('Analytics workspace')
    for (const id of ['section-overview', 'w-kpis', 'metric-visitors', 'nav-section-overview']) expect(stored).not.toContain(`"${id}"`)
    expect(new Set(allDraftIds()).size).toBe(allDraftIds().length)
  })

  it('asks before replacing unsaved changes, and "Keep my changes" leaves everything as it was', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), ' plus edit')
    await openTemplates(user)
    await user.click(settings().getByRole('radio', { name: /Creative/ }))
    await user.click(await settings().findByRole('button', { name: 'Apply Creative' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Replace your unsaved changes?')).toBeInTheDocument()
    expect(within(dialog).getByText(/Cancel brings it back/)).toBeInTheDocument()
    const draft = editor().draftConfig
    await user.click(within(dialog).getByRole('button', { name: 'Keep my changes' }))
    expect(editor().draftConfig).toBe(draft)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(server.templateDetailGets.filter((id) => id === 'tpl-creative')).toHaveLength(1) // only the preview fetched it
  })

  it('"Replace my draft" applies it, and Cancel afterwards restores the saved baseline, not the unsaved edit', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), ' plus edit')
    await openTemplates(user)
    await user.click(settings().getByRole('radio', { name: /Creative/ }))
    await user.click(await settings().findByRole('button', { name: 'Apply Creative' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace my draft' }))
    await settings().findByText(/Creative is now in your draft/)
    expect(sectionTitles()).toEqual(['Studio', 'Ideas', 'Archive'])
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByLabelText('Meeting notes text')).toHaveValue('Original note')
  })

  it('applying twice gives different ids each time', async () => {
    const user = await open()
    await openTemplates(user)
    await user.click(settings().getByRole('radio', { name: /Productivity/ }))
    await user.click(await settings().findByRole('button', { name: 'Apply Productivity' }))
    await settings().findByText(/Productivity is now in your draft/)
    const first = allDraftIds()
    await user.click(settings().getByRole('button', { name: 'Apply Productivity' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace my draft' }))
    await waitFor(() => expect(allDraftIds()).not.toEqual(first))
    expect(allDraftIds().filter((id) => first.includes(id))).toEqual([])
  })
})

describe('Restore default', () => {
  it('restores the default (Productivity) design with new ids, from any other design, as a draft change', async () => {
    const user = await open()
    await openTemplates(user)
    await user.click(settings().getByRole('radio', { name: /Creative/ }))
    await user.click(await settings().findByRole('button', { name: 'Apply Creative' }))
    await settings().findByText(/Creative is now in your draft/)
    expect(sectionTitles()).toEqual(['Studio', 'Ideas', 'Archive'])

    await user.click(settings().getByRole('button', { name: 'Restore default' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace my draft' })) // the draft is dirty now
    await settings().findByText(/The default Productivity design is now in your draft/)
    expect(editor().draftConfig!.title).toBe('My workspace')
    expect(sectionTitles()).toEqual(['Today', 'Reference'])
    expect(allDraftIds()).not.toContain('section-today') // new ids, never the template ones
    expect(server.puts).toHaveLength(0)
    expect(editor().savedConfig!.title).toBe('Ada workspace')
  })

  it('on a clean draft it applies straight away, without asking', async () => {
    const user = await open()
    await openTemplates(user)
    await user.click(settings().getByRole('button', { name: 'Restore default' }))
    await settings().findByText(/The default Productivity design is now in your draft/)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(sectionTitles()).toEqual(['Today', 'Reference'])
  })
})

describe('guards and failures', () => {
  it('is unavailable while a save is in flight', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Meeting notes text'), '!')
    await openTemplates(user)
    await user.click(settings().getByRole('radio', { name: /Creative/ }))
    await settings().findByRole('button', { name: 'Apply Creative' })

    const hold = deferred<Response>()
    server.putHook = () => hold.promise
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(settings().getByRole('button', { name: 'Apply Creative' })).toBeDisabled())
    expect(settings().getByRole('button', { name: 'Restore default' })).toBeDisabled()
    expect(settings().getByText('Wait for the save to finish before replacing the workspace.')).toBeInTheDocument()
    expect(sectionTitles()).toEqual(['My section'])

    hold.resolve(json(200, { id: 'ws-a', revision: 2, updatedAt: '2026-11-23T10:00:00Z', config: editor().draftConfig }))
    await waitFor(() => expect(settings().getByRole('button', { name: 'Apply Creative' })).toBeEnabled())
  })

  it('shows an error and a retry when the list cannot be loaded', async () => {
    server.templateHook = () => apiError(500, 'server_error', 'Boom')
    const user = await open()
    await user.click(settings().getByRole('tab', { name: 'Templates' }))
    expect(await settings().findByRole('alert')).toHaveTextContent(/the templates couldn't be loaded/)
    server.templateHook = undefined
    await user.click(settings().getByRole('button', { name: 'Try again' }))
    expect(await settings().findByRole('radio', { name: /Productivity/ })).toBeInTheDocument()
    expect(server.templateListGets).toBe(2)
  })

  it('says so when there are no templates at all', async () => {
    server.templates.length = 0
    const user = await open()
    await user.click(settings().getByRole('tab', { name: 'Templates' }))
    expect(await settings().findByText('There are no templates to choose from yet.')).toBeInTheDocument()
    expect(settings().queryByRole('button', { name: 'Restore default' })).not.toBeInTheDocument()
  })

  it('reports a template that cannot be loaded, and applies nothing', async () => {
    const user = await open()
    await openTemplates(user)
    server.templateHook = () => apiError(500, 'server_error', 'Boom')
    const draft = editor().draftConfig
    await user.click(settings().getByRole('radio', { name: /Analytics/ }))
    expect(await settings().findByRole('alert')).toHaveTextContent(/the template couldn't be loaded/)
    expect(settings().queryByRole('button', { name: 'Apply Analytics' })).not.toBeInTheDocument()
    expect(editor().draftConfig).toBe(draft)
  })

  it('a template that disappeared between listing and applying is reported without changing the draft', async () => {
    const user = await open()
    await openTemplates(user)
    await user.click(settings().getByRole('radio', { name: /Analytics/ }))
    await settings().findByRole('button', { name: 'Apply Analytics' })
    server.templates.splice(1, 1) // deleted meanwhile
    const draft = editor().draftConfig
    await user.click(settings().getByRole('button', { name: 'Apply Analytics' }))
    expect(await settings().findByRole('alert')).toHaveTextContent('That template no longer exists.')
    expect(editor().draftConfig).toBe(draft)
  })

  it('a template this version cannot read is previewed as an error and cannot be applied', async () => {
    server.templates[1].config = { ...(server.templates[1].config as object), schemaVersion: 2 }
    const user = await open()
    await openTemplates(user)
    const draft = editor().draftConfig
    await user.click(settings().getByRole('radio', { name: /Analytics/ }))
    expect(await settings().findByRole('alert')).toHaveTextContent('could not be read by this version of FlexSpace')
    expect(settings().queryByRole('button', { name: 'Apply Analytics' })).not.toBeInTheDocument()
    expect(editor().draftConfig).toBe(draft)
  })

  it('an expired session while loading hands over to re-authentication instead of showing a broken panel', async () => {
    server.templateHook = () => apiError(401, 'unauthenticated', 'Sign in')
    const user = await open()
    await user.click(settings().getByRole('tab', { name: 'Templates' }))
    await waitFor(() => expect(useSessionStore.getState().status).toBe('reauth'))
  })
})

describe('where the panel is available', () => {
  it('belongs to Edit mode: Preview has no templates panel', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.queryByRole('tab', { name: 'Templates' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})
