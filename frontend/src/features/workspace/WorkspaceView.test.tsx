import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import type { WorkspaceConfig } from '../../domain/workspace/types'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import WorkspaceView from './WorkspaceView'

const editor = () => useEditorStore.getState()
const HOSTILE = '<script>alert(1)</script><b>bold</b>'

function sampleConfig(placement: 'left' | 'top' | 'right' = 'left'): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Sample',
    navigation: {
      placement,
      primaryItems: [
        { id: 'nav-1', label: 'Overview', targetSectionId: 's-main' },
        { id: 'nav-2', label: 'Reference', targetSectionId: 's-stack' },
      ],
      secondaryItems: [{ id: 'nav-3', label: 'Nowhere', targetSectionId: null }],
    },
    sections: [
      {
        id: 's-main', kind: 'grid', title: 'Overview',
        widgets: [
          { id: 'n1', type: 'notes', title: 'Meeting notes', props: { body: 'hello' },
            appearance: { background: '#eef2ff', text: '#1e1b4b', fontSizePx: 14 } },
          { id: 'w1', type: 'welcome', props: { greeting: 'Hi' } },
          { id: 'u1', type: 'kanban', title: 'Board', props: { secret: 'SECRET-UNKNOWN-DATA', columns: [1] },
            appearance: { background: 'url(javascript:alert(1))', width: '100vw' } },
          { id: 'n-hidden', type: 'notes', title: 'Hidden note', hidden: true, props: { body: 'hidden body' } },
        ],
        layout: [
          { i: 'n1', x: 0, y: 0, w: 6, h: 4 }, { i: 'w1', x: 6, y: 0, w: 6, h: 3 },
          { i: 'u1', x: 0, y: 4, w: 4, h: 3 }, { i: 'n-hidden', x: 4, y: 4, w: 4, h: 3 },
        ],
      },
      {
        id: 's-stack', kind: 'stack', title: 'Reference',
        widgets: [
          { id: 'n2', type: 'notes', props: { body: HOSTILE } },
          { id: 'u2', type: 'constructor' },
          { id: 'u3', type: '__proto__' },
        ],
      },
      { id: 's-empty', kind: 'stack', title: 'Empty section' },
      {
        id: 's-hidden', kind: 'grid', title: 'Secret section', hidden: true,
        widgets: [{ id: 'n3', type: 'notes', props: { body: 'in a hidden section' } }],
        layout: [{ i: 'n3', x: 0, y: 0, w: 6, h: 4 }],
      },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.config
}

function renderView(placement: 'left' | 'top' | 'right' = 'left') {
  useEditorStore.getState().load({ ownerId: 'a', workspaceId: 'ws', revision: 1, config: sampleConfig(placement) })
  return render(<WorkspaceView />)
}

const widgetIds = () => [...document.querySelectorAll('[data-widget-id]')].map((el) => el.getAttribute('data-widget-id'))

beforeEach(() => useEditorStore.setState(useEditorStore.getInitialState(), true))
afterEach(() => vi.restoreAllMocks())

describe('rendering the draft', () => {
  it('walks ordered sections, skipping hidden ones', () => {
    renderView()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Overview', 'Reference', 'Empty section'])
    expect(screen.queryByText('Secret section')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('in a hidden section')).not.toBeInTheDocument()
  })

  it('renders visible widgets in semantic order and skips hidden widgets', () => {
    renderView()
    expect(widgetIds()).toEqual(['n1', 'w1', 'u1', 'n2', 'u2', 'u3'])
    expect(screen.queryByText('Hidden note')).not.toBeInTheDocument()
  })

  it('keeps hidden widgets and sections in the draft', () => {
    renderView()
    const draft = editor().draftConfig!
    expect(draft.sections[0].widgets.some((w) => w.id === 'n-hidden')).toBe(true)
    expect(draft.sections.some((s) => s.id === 's-hidden')).toBe(true)
  })

  it('titles widgets from their title, falling back to the type label', () => {
    renderView()
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toContain('Meeting notes')
    expect(titles).toContain('Welcome')
    expect(titles).toContain('Notes') // n2 has no title
  })

  it('gives an empty section a useful message', () => {
    renderView()
    const section = document.querySelector('[data-section-id="s-empty"]') as HTMLElement
    expect(within(section).getByText(/This section is empty/)).toBeInTheDocument()
  })

  it('places grid widgets from the saved layout and leaves stack widgets unplaced', () => {
    renderView()
    const item = (id: string) => document.querySelector(`[data-widget-id="${id}"]`)!.parentElement as HTMLElement
    const vars = (el: HTMLElement) => ['--col', '--span', '--row', '--rows'].map((v) => el.style.getPropertyValue(v))
    expect(vars(item('n1'))).toEqual(['1', '6', '1', '4'])
    expect(vars(item('w1'))).toEqual(['7', '6', '1', '3'])
    expect(vars(item('u1'))).toEqual(['1', '4', '5', '3'])
    expect(vars(item('n2'))).toEqual(['', '', '', ''])
  })
})

describe('known, pending and unknown widget types', () => {
  it('renders every known widget type, including a calendar with its agenda', () => {
    const parsed = parseWorkspaceConfig({
      schemaVersion: 1, title: 'T',
      sections: [{ id: 's', kind: 'stack', title: 'S', widgets: [{ id: 'c1', type: 'calendar', props: { displayMonth: '2026-03', events: [{ id: 'e1', date: '2026-03-05', title: 'Standup' }] } }] }],
    })
    if (!parsed.ok) throw new Error(parsed.message)
    useEditorStore.getState().load({ ownerId: 'a', workspaceId: 'ws', revision: 1, config: parsed.config })
    render(<WorkspaceView />)
    expect(screen.getByText('March 2026')).toBeInTheDocument()
    expect(screen.getByText('Standup')).toBeInTheDocument()
    expect(screen.queryByText(/not available in this build/i)).not.toBeInTheDocument()
  })

  it('renders the welcome widget from its greeting', () => {
    renderView()
    expect(screen.getByText('Hi')).toBeInTheDocument()
  })

  it('renders an unknown type as a bounded placeholder without ever showing its data', () => {
    renderView()
    const placeholder = document.querySelector('[data-widget-id="u1"]') as HTMLElement
    expect(placeholder).toHaveAttribute('data-unsupported', 'true')
    expect(within(placeholder).getByText('Unsupported widget')).toBeInTheDocument()
    expect(within(placeholder).getByText('kanban')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('SECRET-UNKNOWN-DATA')
    expect(placeholder.className).toContain('max-h-48')
  })

  it('never applies an unknown widget\'s opaque appearance', () => {
    renderView()
    const placeholder = document.querySelector('[data-widget-id="u1"]') as HTMLElement
    expect(placeholder.getAttribute('style')).toBeNull()
    expect(document.querySelector('[style*="javascript"], [style*="100vw"]')).toBeNull()
  })

  it('treats prototype-looking type names as plain unknown widgets', () => {
    renderView()
    for (const id of ['u2', 'u3']) {
      expect(document.querySelector(`[data-widget-id="${id}"]`)).toHaveAttribute('data-unsupported', 'true')
    }
  })

  it('leaves unknown widget data untouched in the draft', () => {
    renderView()
    const before = editor().draftConfig!.sections[0].widgets[2]
    expect(before.props).toEqual({ secret: 'SECRET-UNKNOWN-DATA', columns: [1] })
    expect(before.type).toBe('kanban')
  })
})

describe('appearance', () => {
  it('applies validated appearance to known widgets', () => {
    renderView()
    const card = document.querySelector('[data-widget-id="n1"]') as HTMLElement
    expect(card).toHaveStyle({ backgroundColor: '#eef2ff', color: '#1e1b4b', fontSize: '14px' })
  })
})

describe('Notes through the registry', () => {
  it('editing a note changes only the draft, through a domain command', async () => {
    renderView()
    const savedBefore = editor().savedConfig
    const stackBefore = editor().draftConfig!.sections[1]
    const textarea = screen.getByLabelText('Meeting notes text')
    await userEvent.setup().clear(textarea)
    await userEvent.setup().type(textarea, 'Fresh text')
    expect(editor().draftConfig!.sections[0].widgets[0].props).toEqual({ body: 'Fresh text' })
    expect(editor().savedConfig).toBe(savedBefore)
    expect(editor().savedConfig!.sections[0].widgets[0].props).toEqual({ body: 'hello' })
    expect(selectIsDirty(editor())).toBe(true)
    expect(editor().draftConfig!.sections[1]).toBe(stackBefore) // other sections untouched
    expect(screen.getByLabelText('Meeting notes text')).toHaveValue('Fresh text')
  })

  it('editing back to the saved text is clean again', async () => {
    renderView()
    const textarea = screen.getByLabelText('Meeting notes text')
    const user = userEvent.setup()
    await user.type(textarea, '!')
    expect(selectIsDirty(editor())).toBe(true)
    await user.type(textarea, '{Backspace}')
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('shows markup typed or stored in a note as literal text', () => {
    renderView()
    expect(screen.getByDisplayValue(HOSTILE)).toBeInTheDocument()
    expect(document.querySelector('script, b')).toBeNull()
  })

  it('stays editable in Preview, hides the character counter and builder affordances', async () => {
    renderView()
    editor().setMode('preview')
    const user = userEvent.setup()
    const textarea = await screen.findByLabelText('Meeting notes text')
    await user.type(textarea, 'x')
    expect(editor().draftConfig!.sections[0].widgets[0].props).toEqual({ body: 'hellox' })
    expect(screen.queryByText(/10,000/)).not.toBeInTheDocument()
    expect(document.querySelector('[data-widget-id="n1"]')).not.toHaveAttribute('tabindex')
  })
})

describe('selection', () => {
  it('clicking a widget selects it in Edit mode', async () => {
    renderView()
    await userEvent.setup().click(screen.getByRole('heading', { name: 'Meeting notes' }))
    expect(editor().selection).toEqual({ kind: 'widget', id: 'n1' })
    expect(document.querySelector('[data-widget-id="n1"]')).toHaveAttribute('data-selected', 'true')
    expect(document.querySelector('[data-widget-id="w1"]')).not.toHaveAttribute('data-selected')
  })

  it('Enter selects a focused card, but typing inside a note does not re-select', async () => {
    renderView()
    const user = userEvent.setup()
    const card = document.querySelector('[data-widget-id="w1"]') as HTMLElement
    card.focus()
    await user.keyboard('{Enter}')
    expect(editor().selection).toEqual({ kind: 'widget', id: 'w1' })
    editor().select(null)
    await user.type(screen.getByLabelText('Meeting notes text'), '{Enter}')
    expect(editor().selection?.id).toBe('n1') // selected by focusing/clicking into it, not by the Enter key
  })

  it('Preview ignores clicks for selection', async () => {
    renderView()
    editor().setMode('preview')
    await userEvent.setup().click(await screen.findByRole('heading', { name: 'Meeting notes' }))
    expect(editor().selection).toBeNull()
  })
})

describe('temporary navigation', () => {
  it('lists both groups and disables items without a target (Preview)', () => {
    renderView()
    act(() => useEditorStore.getState().setMode('preview'))
    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    expect(within(nav).getByRole('button', { name: 'Overview' })).toBeEnabled()
    expect(within(nav).getByRole('button', { name: 'Reference' })).toBeEnabled()
    expect(within(nav).getByRole('button', { name: 'Nowhere' })).toBeDisabled()
  })

  it('moves to and focuses the target section', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderView()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reference' }))
    const target = document.querySelector('[data-section-id="s-stack"]') as HTMLElement
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(target).toHaveFocus()
  })

  it.each([
    ['top', 'flex-col'],
    ['left', 'lg:flex-row'],
    ['right', 'lg:flex-row-reverse'],
  ] as const)('honours the saved %s placement', (placement, cls) => {
    const { container } = renderView(placement)
    expect((container.firstElementChild as HTMLElement).className).toContain(cls)
  })

  it('renders nothing when there are no navigation items', () => {
    useEditorStore.getState().load({
      ownerId: 'a', workspaceId: 'ws', revision: 1,
      config: { ...sampleConfig(), navigation: { placement: 'left', primaryItems: [], secondaryItems: [] } },
    })
    useEditorStore.getState().setMode('preview')
    render(<WorkspaceView />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('in Edit an empty navigation still shows both (empty) groups as drop targets', () => {
    useEditorStore.getState().load({
      ownerId: 'a', workspaceId: 'ws', revision: 1,
      config: { ...sampleConfig(), navigation: { placement: 'left', primaryItems: [], secondaryItems: [] } },
    })
    render(<WorkspaceView />)
    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    expect(within(nav).getByRole('list', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(within(nav).getByRole('list', { name: 'Secondary navigation' })).toBeInTheDocument()
    expect(within(nav).getByText('Drop an item here to add it to primary')).toBeInTheDocument()
    expect(within(nav).getByText('Drop an item here to add it to secondary')).toBeInTheDocument()
  })

  it('in Edit an unlinked item is clickable (it selects the item) and every item has a reorder handle', async () => {
    renderView()
    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    await userEvent.setup().click(within(nav).getByRole('button', { name: 'Nowhere' }))
    expect(useEditorStore.getState().selection).toEqual({ kind: 'navItem', id: 'nav-3' })
    for (const label of ['Overview', 'Reference', 'Nowhere']) expect(within(nav).getByRole('button', { name: `Reorder ${label}` })).toBeInTheDocument()
  })
})

describe('no browser storage or code execution', () => {
  it('never writes to web storage while rendering and editing', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderView()
    await userEvent.setup().type(screen.getByLabelText('Meeting notes text'), 'x')
    expect(setItem).not.toHaveBeenCalled()
  })
})
