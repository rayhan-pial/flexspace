import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { installFetch } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { inspector } from '../../test/shell'
import { stubViewport } from '../../test/viewport'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'

const editor = () => useEditorStore.getState()

const CONFIG = {
  schemaVersion: 1,
  title: 'Ada workspace',
  navigation: { placement: 'top', primaryItems: [{ id: 'nav-1', label: 'Overview', targetSectionId: 's-main' }], secondaryItems: [] },
  sections: [
    {
      id: 's-main', kind: 'grid', title: 'Overview',
      widgets: [
        { id: 'n1', type: 'notes', title: 'Meeting notes', props: { body: 'Original note' } },
        { id: 'w1', type: 'welcome', title: 'Welcome card', props: { greeting: 'Hi', subtitle: '' } },
        { id: 'w2', type: 'welcome', title: 'Empty welcome', props: { greeting: '', subtitle: '' } },
      ],
      layout: [
        { i: 'n1', x: 0, y: 0, w: 6, h: 4 }, { i: 'w1', x: 6, y: 0, w: 6, h: 3 }, { i: 'w2', x: 0, y: 4, w: 6, h: 3 },
      ],
    },
  ],
}

let server: FakeServer
let viewport: ReturnType<typeof stubViewport>

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  server = createFakeServer({ a: 'Ada workspace' }, { a: CONFIG })
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

const card = (name: string) => screen.getByRole('article', { name })
const rectOf = (id: string) => editor().draftConfig!.sections[0].layout!.find((r) => r.i === id)!

describe('widget chrome', () => {
  it('marks only the selected widget, with a word and not just a colour', async () => {
    const user = await open()
    expect(screen.queryByText('Selected')).not.toBeInTheDocument()
    await user.click(card('Meeting notes'))
    expect(within(card('Meeting notes')).getByText('Selected')).toBeInTheDocument()
    expect(card('Meeting notes')).toHaveAttribute('data-selected', 'true')
    expect(within(card('Welcome card')).queryByText('Selected')).not.toBeInTheDocument()
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('shows no selection label in Preview', async () => {
    const user = await open()
    await user.click(card('Meeting notes'))
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.queryByText('Selected')).not.toBeInTheDocument()
  })

  it('keeps the card heading as its accessible name when the chrome gains an icon and a label', async () => {
    const user = await open()
    await user.click(card('Welcome card'))
    expect(screen.getByRole('article', { name: 'Welcome card' })).toBeInTheDocument()
    expect(card('Welcome card').querySelector('h3')).toHaveTextContent('Welcome card')
    expect(card('Welcome card').querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('draws the Welcome accent only when there is something to greet with', async () => {
    await open()
    expect(card('Welcome card').querySelector('[data-welcome-accent]')).not.toBeNull()
    expect(card('Empty welcome').querySelector('[data-welcome-accent]')).toBeNull()
    expect(within(card('Empty welcome')).getByText(/add a greeting in Properties/)).toBeInTheDocument()
  })
})

describe('grid step controls', () => {
  async function selectNotes() {
    const user = await open()
    await user.click(card('Meeting notes'))
    return user
  }

  it('moves and resizes one cell per click through the existing command, and Undo reverses it', async () => {
    const user = await selectNotes()
    const panel = inspector()
    await user.click(panel.getByRole('button', { name: 'Make Meeting notes narrower' }))
    expect(rectOf('n1')).toMatchObject({ x: 0, w: 5 })
    await user.click(panel.getByRole('button', { name: 'Move Meeting notes right' }))
    expect(rectOf('n1')).toMatchObject({ x: 1, w: 5 })
    await user.click(panel.getByRole('button', { name: 'Make Meeting notes shorter' }))
    expect(rectOf('n1')).toMatchObject({ h: 3 })
    expect(panel.getByText(/Column 2, row 1, 5 columns wide, 3 rows tall\./)).toBeInTheDocument()
    expect(selectIsDirty(editor())).toBe(true)
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(rectOf('n1')).toEqual({ i: 'n1', x: 0, y: 0, w: 6, h: 4 })
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('explains a refused step next to the controls and leaves the draft untouched', async () => {
    const user = await selectNotes()
    const panel = inspector()
    const draft = editor().draftConfig
    await user.click(panel.getByRole('button', { name: 'Move Meeting notes left' }))
    expect(panel.getByRole('alert')).toHaveTextContent('That is outside the grid.')
    await user.click(panel.getByRole('button', { name: 'Make Meeting notes wider' }))
    expect(panel.getByRole('alert')).toHaveTextContent('That space is taken by another widget.')
    expect(editor().draftConfig).toBe(draft)
    expect(selectIsDirty(editor())).toBe(false)
    await user.click(panel.getByRole('button', { name: 'Make Meeting notes narrower' }))
    expect(panel.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the Order buttons and offers no step controls in Preview', async () => {
    const user = await selectNotes()
    expect(inspector().getByRole('button', { name: 'Move up' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.queryByRole('button', { name: /^(Move|Make) Meeting notes/ })).not.toBeInTheDocument()
  })
})
