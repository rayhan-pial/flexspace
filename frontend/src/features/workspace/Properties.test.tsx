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
  navigation: {
    placement: 'left',
    primaryItems: [{ id: 'nav-1', label: 'Overview', targetSectionId: 's-main', icon: 'home' }],
    secondaryItems: [{ id: 'nav-2', label: 'Reference', targetSectionId: 's-ref', icon: 'folder' }],
  },
  sections: [
    {
      id: 's-main', kind: 'grid', title: 'Overview',
      widgets: [
        { id: 'n1', type: 'notes', title: 'Meeting notes', props: { body: 'Original note' } },
        { id: 'u1', type: 'kanban', title: '', props: { x: 1 } },
      ],
      layout: [{ i: 'n1', x: 0, y: 0, w: 6, h: 4 }, { i: 'u1', x: 6, y: 0, w: 4, h: 3 }],
    },
    { id: 's-ref', kind: 'stack', title: 'Reference' },
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
const card = (id: string) => document.querySelector(`[data-widget-id="${id}"]`) as HTMLElement
const themed = () => document.querySelector('.fs-themed') as HTMLElement
const note = () => editor().draftConfig!.sections[0].widgets[0]

type User = ReturnType<typeof userEvent.setup>

// Select through the outline (which keeps the Outline view), then open the Properties.
async function selectNotes(user: User) {
  await goTo(user, 'Outline')
  await user.click(outline().getByRole('button', { name: 'Meeting notes' }))
  await goTo(user, 'My workspace')
}

describe('widget properties', () => {
  it('title and note text update the draft and the canvas live', async () => {
    const user = await open()
    await selectNotes(user)
    const title = settings().getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Standup')
    expect(note().title).toBe('Standup')
    expect(within(card('n1')).getByRole('heading', { name: 'Standup' })).toBeInTheDocument()
    await user.type(settings().getByLabelText('Note'), '!')
    expect(note().props).toEqual({ body: 'Original note!' })
    expect(screen.getByLabelText('Standup text')).toHaveValue('Original note!')
  })

  it('a valid hex colour applies live; an invalid one is flagged and never reaches the draft', async () => {
    const user = await open()
    await selectNotes(user)
    const background = settings().getByLabelText('Background')
    await user.type(background, '#336699')
    expect(note().appearance).toEqual({ background: '#336699' })
    expect(card('n1').style.backgroundColor).toBe('rgb(51, 102, 153)')

    await user.clear(background)
    await user.type(background, '#12')
    expect(settings().getByRole('alert')).toHaveTextContent('six hex digits')
    expect(background).toHaveAttribute('aria-invalid', 'true')
    expect(note().appearance).toEqual({ background: '#336699' }) // last valid value kept
    await user.tab() // leaving the field restores the real value
    expect(background).toHaveValue('#336699')
    expect(settings().queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects markup and CSS in colour fields', async () => {
    const user = await open()
    await selectNotes(user)
    await user.type(settings().getByLabelText('Text color'), 'red;x')
    expect(note().appearance).toEqual({})
    expect(card('n1').getAttribute('style') ?? '').not.toContain('red')
  })

  it('the react-colorful picker changes the colour, and Use theme default removes the override', async () => {
    const user = await open()
    await selectNotes(user)
    await user.click(settings().getByRole('button', { name: 'Pick background' }))
    const picker = document.querySelector('.react-colorful__saturation') as HTMLElement
    expect(picker).not.toBeNull()
    await user.type(settings().getByLabelText('Background'), '#abcdef')
    expect(note().appearance).toEqual({ background: '#abcdef' })
    await user.click(settings().getByRole('button', { name: 'Use theme default' }))
    expect(note().appearance).toEqual({})
    expect(card('n1').style.backgroundColor).toBe('')
  })

  it('font size accepts 12-24 and flags anything else without changing the draft', async () => {
    const user = await open()
    await selectNotes(user)
    const size = settings().getByLabelText('Font size (px)')
    await user.type(size, '18')
    expect(note().appearance).toEqual({ fontSizePx: 18 })
    expect(card('n1').style.fontSize).toBe('18px')
    await user.clear(size)
    await user.type(size, '30')
    expect(settings().getByRole('alert')).toHaveTextContent('from 12 to 24')
    expect(note().appearance).toEqual({ fontSizePx: 18 })
    await user.clear(size)
    await user.type(size, 'abc')
    expect(note().appearance).toEqual({ fontSizePx: 18 })
  })

  it('an unsupported widget exposes no editable fields', async () => {
    const user = await open()
    await goTo(user, 'Outline')
    await user.click(outline().getByRole('button', { name: 'Unsupported: kanban' }))
    await goTo(user, 'My workspace')
    expect(settings().getByText('Unsupported (kanban)')).toBeInTheDocument()
    expect(settings().queryByLabelText('Title')).not.toBeInTheDocument()
    expect(settings().queryByLabelText('Background')).not.toBeInTheDocument()
  })

  it('Cancel reverses property edits and Save persists them', async () => {
    const user = await open()
    await selectNotes(user)
    await user.type(settings().getByLabelText('Background'), '#336699')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(note().appearance).toEqual({})

    await selectNotes(user)
    await user.type(settings().getByLabelText('Background'), '#336699')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
    const saved = server.puts[0].config as { sections: Array<{ widgets: Array<{ appearance: unknown }> }> }
    expect(saved.sections[0].widgets[0].appearance).toEqual({ background: '#336699' })
  })
})

describe('theme', () => {
  it('colours, font family and size apply live through validated CSS variables', async () => {
    const user = await open()
    await goTo(user, 'Appearance')
    await user.clear(settings().getByLabelText('Primary color'))
    await user.type(settings().getByLabelText('Primary color'), '#aa0000')
    await user.clear(settings().getByLabelText('Workspace background'))
    await user.type(settings().getByLabelText('Workspace background'), '#101010')
    await user.selectOptions(settings().getByLabelText('Font family'), 'mono')
    await user.clear(settings().getByLabelText('Base font size (px)'))
    await user.type(settings().getByLabelText('Base font size (px)'), '18')

    expect(editor().draftConfig!.theme).toMatchObject({ primary: '#aa0000', background: '#101010', fontFamily: 'mono', fontSizePx: 18 })
    const style = themed().style
    expect(style.getPropertyValue('--fs-primary')).toBe('#aa0000')
    expect(style.getPropertyValue('--fs-background')).toBe('#101010')
    expect(style.getPropertyValue('--fs-font')).toContain('monospace')
    expect(style.getPropertyValue('--fs-size')).toBe('18px')
  })

  it('invalid theme values are flagged and do not change the draft or the page', async () => {
    const user = await open()
    await goTo(user, 'Appearance')
    const before = editor().draftConfig
    await user.clear(settings().getByLabelText('Text color'))
    await user.type(settings().getByLabelText('Text color'), 'blue')
    expect(settings().getByRole('alert')).toHaveTextContent('six hex digits')
    expect(editor().draftConfig).toBe(before)
    await user.clear(settings().getByLabelText('Base font size (px)'))
    await user.type(settings().getByLabelText('Base font size (px)'), '99')
    expect(settings().getByRole('alert')).toHaveTextContent('from 12 to 20')
    expect(editor().draftConfig).toBe(before)
  })

  it('opening inspector views does not dirty the draft', async () => {
    const user = await open()
    await goTo(user, 'Appearance')
    await goTo(user, 'My workspace')
    await goTo(user, 'Components')
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('Cancel restores the theme and Save persists it', async () => {
    const user = await open()
    await goTo(user, 'Appearance')
    await user.selectOptions(settings().getByLabelText('Font family'), 'serif')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(editor().draftConfig!.theme.fontFamily).toBe('system')
    expect(themed().style.getPropertyValue('--fs-font')).toContain('system-ui')

    await user.selectOptions(settings().getByLabelText('Font family'), 'serif')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
    expect((server.puts[0].config as { theme: { fontFamily: string } }).theme.fontFamily).toBe('serif')
  })
})

describe('navigation', () => {
  it('changing placement moves the one nav model without duplicating or losing items', async () => {
    const user = await open()
    await goTo(user, 'Outline')
    const items = editor().draftConfig!.navigation
    const nav = () => screen.getByRole('navigation', { name: 'Workspace' })
    expect(within(nav()).getAllByRole('button', { name: /^(Overview|Reference)$/ })).toHaveLength(2)
    for (const placement of ['top', 'right', 'left']) {
      await user.selectOptions(left().getByLabelText('Navigation placement'), placement)
      expect(editor().draftConfig!.navigation.placement).toBe(placement)
      expect(editor().draftConfig!.navigation.primaryItems).toBe(items.primaryItems)
      expect(editor().draftConfig!.navigation.secondaryItems).toBe(items.secondaryItems)
      expect(screen.getAllByRole('navigation', { name: 'Workspace' })).toHaveLength(1)
      expect(within(nav()).getAllByRole('button', { name: /^(Overview|Reference)$/ })).toHaveLength(2)
    }
    expect(selectIsDirty(editor())).toBe(false) // back where it started
  })

  it('edits a nav item label, target and icon, reflected on the canvas navigation', async () => {
    const user = await open()
    await goTo(user, 'Outline')
    await user.click(within(screen.getByRole('list', { name: 'Secondary navigation items' })).getByRole('button', { name: 'Reference' }))
    expect(editor().selection).toEqual({ kind: 'navItem', id: 'nav-2' })
    await goTo(user, 'My workspace')
    await user.clear(settings().getByLabelText('Label'))
    await user.type(settings().getByLabelText('Label'), 'Docs')
    await user.selectOptions(settings().getByLabelText('Goes to'), 's-main')
    await user.selectOptions(settings().getByLabelText('Icon'), 'star')
    expect(editor().draftConfig!.navigation.secondaryItems).toEqual([{ id: 'nav-2', label: 'Docs', targetSectionId: 's-main', icon: 'star' }])
    expect(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('button', { name: 'Docs' })).toBeEnabled()
    await user.selectOptions(settings().getByLabelText('Goes to'), '')
    expect(editor().draftConfig!.navigation.secondaryItems[0].targetSectionId).toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('button', { name: 'Docs' })).toBeEnabled() // still selectable in Edit
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('button', { name: 'Docs' })).toBeDisabled()
  })

  it('placement and nav edits persist on Save and are reversed by Cancel', async () => {
    const user = await open()
    await goTo(user, 'Outline')
    await user.selectOptions(left().getByLabelText('Navigation placement'), 'top')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(editor().draftConfig!.navigation.placement).toBe('left')

    await user.selectOptions(left().getByLabelText('Navigation placement'), 'right')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
    const saved = server.puts[0].config as { navigation: { placement: string; primaryItems: unknown[]; secondaryItems: unknown[] } }
    expect(saved.navigation.placement).toBe('right')
    expect(saved.navigation.primaryItems).toHaveLength(1)
    expect(saved.navigation.secondaryItems).toHaveLength(1)
  })
})
