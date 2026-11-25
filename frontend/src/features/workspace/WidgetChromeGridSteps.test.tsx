import { act, render, screen, within } from '@testing-library/react'
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

  it('disables a step that cannot run before it is clicked, explains why, and re-enables it after a valid change (UI-022)', async () => {
    const user = await selectNotes()
    const panel = inspector()
    const left = () => panel.getByRole('button', { name: 'Move Meeting notes left' })
    const up = () => panel.getByRole('button', { name: 'Move Meeting notes up' })
    const right = () => panel.getByRole('button', { name: 'Move Meeting notes right' })
    const wider = () => panel.getByRole('button', { name: 'Make Meeting notes wider' })
    const draft = editor().draftConfig
    const history = editor().history
    // Notes is at column 0, row 0, 6 wide (the right half is taken by a neighbour, which is fine).
    expect(left()).toBeDisabled()
    expect(left()).toHaveAccessibleDescription('Already at the left edge of the grid.')
    expect(up()).toBeDisabled()
    expect(up()).toHaveAccessibleDescription('Already at the top of the grid.')
    expect(right()).toBeEnabled() // occupied, but the neighbour can be pushed: available
    expect(wider()).toBeEnabled()
    expect(panel.getByTestId('step-reasons')).toHaveTextContent('Left (already at the left edge of the grid)')
    // Merely evaluating availability never touched the draft or history.
    expect(editor().draftConfig).toBe(draft)
    expect(editor().history).toBe(history)
    expect(selectIsDirty(editor())).toBe(false)

    await user.click(left()) // a click on a natively disabled button does nothing
    expect(editor().draftConfig).toBe(draft)

    await user.click(right())
    expect(panel.queryByRole('alert')).not.toBeInTheDocument()
    expect(selectIsDirty(editor())).toBe(true)
    expect(left()).toBeEnabled() // re-enabled right away
    await user.click(left())
    expect(left()).toBeDisabled()
  })

  it('size steps stop at the type minimum and at the grid edge, with reasons', async () => {
    const user = await selectNotes()
    const panel = inspector()
    const narrower = () => panel.getByRole('button', { name: 'Make Meeting notes narrower' })
    const shorter = () => panel.getByRole('button', { name: 'Make Meeting notes shorter' })
    for (let i = 0; i < 3; i += 1) await user.click(narrower()) // notes minimum width is 3, starting at 6
    expect(narrower()).toBeDisabled()
    expect(narrower()).toHaveAccessibleDescription('Already at the narrowest this widget can be.')
    expect(shorter()).toBeEnabled()
    for (let i = 0; i < 1; i += 1) await user.click(shorter()) // notes minimum height is 3, starting at 4
    expect(shorter()).toBeDisabled()
    expect(shorter()).toHaveAccessibleDescription('Already at the shortest this widget can be.')
    await user.click(panel.getByRole('button', { name: 'Make Meeting notes wider' }))
    expect(narrower()).toBeEnabled()
  })

  it('every step control is disabled with a reason while a drag is in progress', async () => {
    const user = await selectNotes()
    const panel = inspector()
    act(() => { editor().beginGesture('grid') })
    const move = panel.getByRole('button', { name: 'Move Meeting notes right' })
    expect(move).toBeDisabled()
    expect(move).toHaveAccessibleDescription('Finish the drag or resize first.')
    act(() => { editor().endGesture() })
    expect(move).toBeEnabled()
    expect(user).toBeDefined()
  })

  it('keeps the Order buttons and offers no step controls in Preview', async () => {
    const user = await selectNotes()
    expect(inspector().getByRole('button', { name: 'Move up' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.queryByRole('button', { name: /^(Move|Make) Meeting notes/ })).not.toBeInTheDocument()
  })
})
