import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { MAX_WIDGETS } from '../../domain/workspace/constants'
import { installFetch } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { goTo, inspector } from '../../test/shell'
import { stubViewport } from '../../test/viewport'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import { contrastRatio, themeContrastChecks } from './contrast'

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

function seed(config: unknown) {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  server = createFakeServer({ a: 'Ada workspace' }, { a: config })
  server.session = 'a'
  installFetch(server.handlers)
  viewport = stubViewport(true)
}

beforeEach(() => seed(OWN))
afterEach(() => {
  viewport.restore()
  vi.unstubAllGlobals()
})

async function open() {
  render(<App />)
  await screen.findByLabelText('Meeting notes text')
  return userEvent.setup()
}

describe('contrast helper', () => {
  it('computes WCAG ratios and ignores invalid colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
    expect(contrastRatio('#fff', '#000000')).toBeNull()
    expect(themeContrastChecks({ primary: '#ffffff', background: '#ffffff', surface: '#ffffff', text: '#ffffff' }).every((check) => !check.ok)).toBe(true)
    expect(themeContrastChecks({ primary: 'nope', background: '#ffffff', surface: '#ffffff', text: '#000000' })).toHaveLength(2)
  })
})

describe('component library', () => {
  it('describes every widget and does not touch the draft while searching or filtering', async () => {
    const user = await open()
    await goTo(user, 'Components')
    const list = within(inspector().getByRole('list', { name: 'Component library' }))
    expect(list.getAllByRole('listitem')).toHaveLength(6)
    expect(list.getByText(/A checklist you can add to/)).toBeInTheDocument()
    const draft = editor().draftConfig

    await user.type(inspector().getByLabelText('Search components'), 'calendar')
    expect(within(inspector().getByRole('list', { name: 'Component library' })).getAllByRole('listitem')).toHaveLength(1)
    expect(inspector().getByText('1 of 6 components shown.')).toBeInTheDocument()

    await user.clear(inspector().getByLabelText('Search components'))
    await user.click(inspector().getByRole('button', { name: 'Productivity' }))
    expect(inspector().getByRole('button', { name: 'Productivity' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(inspector().getByRole('list', { name: 'Component library' })).getAllByRole('listitem')).toHaveLength(2)

    expect(editor().draftConfig).toBe(draft)
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('shows an empty state with a way to clear the search', async () => {
    const user = await open()
    await goTo(user, 'Components')
    await user.type(inspector().getByLabelText('Search components'), 'zzzz')
    expect(inspector().getByText('No components match.')).toBeInTheDocument()
    expect(inspector().queryByRole('list', { name: 'Component library' })).not.toBeInTheDocument()
    await user.click(inspector().getByRole('button', { name: 'Clear search and filter' }))
    expect(within(inspector().getByRole('list', { name: 'Component library' })).getAllByRole('listitem')).toHaveLength(6)
  })

  it('one activation adds exactly one widget, selects it and opens Properties on it', async () => {
    const user = await open()
    await goTo(user, 'Components')
    await user.click(inspector().getByRole('button', { name: 'Add Tasks' }))
    const widgets = editor().draftConfig!.sections[0].widgets
    expect(widgets.map((w) => w.type)).toEqual(['notes', 'tasks'])
    expect(editor().selection).toEqual({ kind: 'widget', id: widgets[1].id })
  })

  it('confirms an add and offers the new widget in Properties without leaving the library', async () => {
    const user = await open()
    await goTo(user, 'Components')
    await user.click(inspector().getByRole('button', { name: 'Add Gallery' }))
    expect(inspector().getByText(/Added Gallery to My section and selected it\./)).toBeInTheDocument()
    expect(inspector().getByRole('heading', { name: 'Components' })).toBeInTheDocument()
    await user.click(inspector().getByRole('button', { name: 'Edit properties' }))
    expect(inspector().getByRole('heading', { name: 'Properties' })).toBeInTheDocument()
    expect(inspector().getByRole('heading', { name: 'Gallery', level: 3 })).toBeInTheDocument()
  })

  it('offers the outline when there are no sections', async () => {
    seed({ ...OWN, sections: [], navigation: { ...OWN.navigation, primaryItems: [] } })
    render(<App />)
    await screen.findByText(/This workspace has no sections yet/)
    const user = userEvent.setup()
    await goTo(user, 'Components')
    expect(inspector().getByText(/Add a section in the Outline tab first/)).toBeInTheDocument()
    await user.click(inspector().getByRole('button', { name: 'Open outline' }))
    expect(inspector().getByRole('heading', { name: 'Outline' })).toBeInTheDocument()
  })

  it('disables Add and explains the limit when the workspace is full', async () => {
    const widgets = Array.from({ length: MAX_WIDGETS }, (_, i) => ({ id: `w${i}`, type: 'notes', title: i === 0 ? 'Meeting notes' : `Note ${i}`, props: { body: '' } }))
    seed({ ...OWN, sections: [{ id: 's-own', kind: 'stack', title: 'My section', widgets }] })
    const user = await open()
    await goTo(user, 'Components')
    expect(inspector().getByText(new RegExp(`limit of ${MAX_WIDGETS} widgets`))).toBeInTheDocument()
    expect(inspector().getByRole('button', { name: 'Add Tasks' })).toBeDisabled()
  })
})

describe('workspace appearance', () => {
  it('groups colors and typography, with a live sample that follows the draft', async () => {
    const user = await open()
    await goTo(user, 'Appearance')
    for (const name of ['Suggested palettes', 'Colors', 'Typography']) {
      expect(inspector().getByRole('region', { name })).toBeInTheDocument()
    }
    const sample = inspector().getByRole('group', { name: 'Theme sample' })
    await user.clear(inspector().getByLabelText('Card background'))
    await user.type(inspector().getByLabelText('Card background'), '#112233')
    expect(sample.firstElementChild).toHaveStyle({ backgroundColor: '#112233' })
  })

  it('applies a suggested palette as one undoable step that sets only the four colors', async () => {
    const user = await open()
    await goTo(user, 'Appearance')
    const before = editor().draftConfig!.theme
    await user.click(inspector().getByRole('button', { name: 'Use Midnight palette' }))
    const after = editor().draftConfig!.theme
    expect(after).toMatchObject({ primary: '#818cf8', background: '#0f172a', surface: '#1e293b', text: '#e2e8f0' })
    expect(after.fontFamily).toBe(before.fontFamily)
    expect(after.fontSizePx).toBe(before.fontSizePx)
    expect(selectIsDirty(editor())).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(editor().draftConfig!.theme).toEqual(before)
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('warns about low contrast without blocking or changing the color', async () => {
    const user = await open()
    await goTo(user, 'Appearance')
    await user.clear(inspector().getByLabelText('Text color'))
    await user.type(inspector().getByLabelText('Text color'), '#f8fafd')
    expect(editor().draftConfig!.theme.text).toBe('#f8fafd')
    expect(inspector().getByText(/Text on cards: 1\.\d:1 is low/)).toBeInTheDocument()
    expect(inspector().getByText(/suggestion only/)).toBeInTheDocument()
  })

  it('keeps the sample accent readable: its text flips between white and black with the color', async () => {
    const user = await open()
    await goTo(user, 'Appearance')
    const chip = () => inspector().getByText('Primary accent')
    await user.clear(inspector().getByLabelText('Primary color'))
    await user.type(inspector().getByLabelText('Primary color'), '#ffffcc')
    expect(chip()).toHaveStyle({ color: '#000000' })
    await user.clear(inspector().getByLabelText('Primary color'))
    await user.type(inspector().getByLabelText('Primary color'), '#222222')
    expect(chip()).toHaveStyle({ color: '#ffffff' })
  })

  it('keeps an invalid hex out of the draft', async () => {
    const user = await open()
    await goTo(user, 'Appearance')
    const before = editor().draftConfig!.theme.primary
    await user.clear(inspector().getByLabelText('Primary color'))
    await user.type(inspector().getByLabelText('Primary color'), '#12')
    expect(inspector().getByRole('alert')).toHaveTextContent(/six hex digits/)
    expect(editor().draftConfig!.theme.primary).toBe(before)
  })
})

describe('template gallery', () => {
  async function openTemplates() {
    const user = await open()
    await goTo(user, 'Templates')
    await inspector().findByRole('radio', { name: /Productivity/ })
    return user
  }

  it('draws a distinct picture of each ready-made design from its own configuration', async () => {
    await openTemplates()
    await waitFor(() => expect(inspector().getAllByTestId('template-thumbnail')).toHaveLength(3))
    const signature = inspector().getAllByTestId('template-thumbnail').map((node) => `${node.getAttribute('data-placement')}|${node.getAttribute('style')}|${node.innerHTML.length}`)
    expect(new Set(signature).size).toBe(3)
  })

  it('groups ready-made and personal templates with separate snapshot and restore actions', async () => {
    await openTemplates()
    for (const name of ['Ready-made', 'My templates', 'Save current design', 'Restore default']) {
      expect(inspector().getByRole('region', { name })).toBeInTheDocument()
    }
    expect(inspector().getByText(/You have no saved templates yet/)).toBeInTheDocument()
  })

  it('does not fetch or change anything more when choosing a design whose picture already loaded', async () => {
    const user = await openTemplates()
    await waitFor(() => expect(inspector().getAllByTestId('template-thumbnail')).toHaveLength(3))
    const gets = server.templateDetailGets.length
    await user.click(inspector().getByRole('radio', { name: /Creative/ }))
    expect(await inspector().findByRole('region', { name: 'Creative preview' })).toBeInTheDocument()
    expect(server.templateDetailGets).toHaveLength(gets)
    expect(selectIsDirty(editor())).toBe(false)
    expect(server.puts).toHaveLength(0)
  })
})
