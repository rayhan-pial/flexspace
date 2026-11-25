import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KNOWN_WIDGET_TYPES } from '../../domain/workspace/constants'
import { setSectionHidden } from '../../domain/workspace/lifecycle'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { goTo, libraryDialog } from '../../test/shell'
import { stubViewport } from '../../test/viewport'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import EditorShell from './EditorShell'

/* UI-023: the Add component dialog names its destination, never uses a hidden section, and reveals the result. */

const editor = () => useEditorStore.getState()
let viewport: ReturnType<typeof stubViewport>

function load(sections: unknown[]) {
  const parsed = parseWorkspaceConfig({ schemaVersion: 1, title: 'Add', sections })
  if (!parsed.ok) throw new Error(parsed.message)
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
}

const grid = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, kind: 'grid', title, widgets: [{ id: `${id}-n`, type: 'notes', title: `${title} note` }], layout: [{ i: `${id}-n`, x: 0, y: 0, w: 6, h: 4 }], ...extra,
})
const stack = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, kind: 'stack', title, widgets: [{ id: `${id}-n`, type: 'notes', title: `${title} note` }], ...extra })
const sectionOf = (id: string) => editor().draftConfig!.sections.find((s) => s.id === id)!

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  viewport = stubViewport(true)
})
afterEach(() => {
  viewport.restore()
  vi.restoreAllMocks()
})

describe('Add component destination', () => {
  it('defaults to the first visible section, never a hidden one, and can be changed explicitly and stays', async () => {
    load([stack('hid', 'Hidden one', { hidden: true }), grid('g', 'Dash'), stack('s', 'Reading')])
    render(<EditorShell />)
    const user = userEvent.setup()
    const lib = await goTo(user, 'Components')
    const select = lib.getByLabelText('Add to section')
    expect(select).toHaveDisplayValue('Dash · dashboard grid')
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(['Dash · dashboard grid', 'Reading · stack'])
    expect(lib.getByText(/Adding to Dash \(dashboard grid\)\. It takes the first free spot/)).toBeInTheDocument()
    await user.selectOptions(select, 'Reading · stack')
    expect(lib.getByText(/Adding to Reading \(stack\)\. It goes to the end of the stack/)).toBeInTheDocument()
    await user.type(lib.getByLabelText('Search components'), 'cal') // other presentation state does not reset the choice
    expect(select).toHaveDisplayValue('Reading · stack')
  })

  it('defaults to the visible section of the selected widget, and falls back from a hidden selected section', async () => {
    load([grid('g', 'Dash'), stack('s', 'Reading')])
    render(<EditorShell />)
    const user = userEvent.setup()
    act(() => editor().select({ kind: 'widget', id: 's-n' }))
    expect((await goTo(user, 'Components')).getByLabelText('Add to section')).toHaveDisplayValue('Reading · stack')
    await user.keyboard('{Escape}')
    act(() => {
      editor().apply(setSectionHidden('s', true))
      editor().select({ kind: 'section', id: 's' })
    })
    expect((await goTo(user, 'Components')).getByLabelText('Add to section')).toHaveDisplayValue('Dash · dashboard grid')
  })

  it('tells duplicate section titles apart', async () => {
    load([stack('a', 'Notes'), stack('b', 'Notes'), stack('c', 'Other')])
    render(<EditorShell />)
    const lib = await goTo(userEvent.setup(), 'Components')
    expect([...(lib.getByLabelText('Add to section') as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      'Notes (section 1) · stack', 'Notes (section 2) · stack', 'Other · stack',
    ])
  })

  it('adds every registered type once to a grid and to a stack, exactly where shown', async () => {
    load([grid('g', 'Dash'), stack('s', 'Reading')])
    render(<EditorShell />)
    const user = userEvent.setup()
    for (const [target, label] of [['g', 'Dash · dashboard grid'], ['s', 'Reading · stack']] as const) {
      const before = sectionOf(target).widgets.length
      for (const type of KNOWN_WIDGET_TYPES) {
        const lib = await goTo(user, 'Components')
        await user.selectOptions(lib.getByLabelText('Add to section'), label)
        await user.click(lib.getByRole('button', { name: new RegExp(`^Add ${type}$`, 'i') }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      }
      const widgets = sectionOf(target).widgets
      expect(widgets.slice(before).map((w) => w.type)).toEqual([...KNOWN_WIDGET_TYPES])
      if (target === 'g') expect(sectionOf('g').layout).toHaveLength(widgets.length) // every card has a rectangle
    }
    expect(sectionOf('g').widgets.length).toBe(1 + KNOWN_WIDGET_TYPES.length)
    expect(sectionOf('s').widgets.length).toBe(1 + KNOWN_WIDGET_TYPES.length)
  })

  it('closes on success, opens Properties, selects, announces where, scrolls and focuses the real card', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    load([grid('g', 'Dash')])
    render(<EditorShell />)
    const user = userEvent.setup()
    const lib = await goTo(user, 'Components')
    await user.click(lib.getByRole('button', { name: 'Add Calendar' }))
    const id = editor().selection!.id
    expect(editor().selection).toEqual({ kind: 'widget', id })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveTextContent('Properties')
    expect(screen.getByTestId('add-confirmation')).toHaveTextContent('Added Calendar to Dash (dashboard grid) and selected it')
    expect(selectIsDirty(editor())).toBe(true)
    act(() => frames.splice(0).forEach((cb) => cb(0)))
    const card = document.querySelector<HTMLElement>(`[data-widget-id="${id}"]`)!
    expect(card).not.toBeNull()
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }))
    expect(card).toHaveFocus()
    vi.unstubAllGlobals()
  })

  it('shows a visible destination below the fold: the new card exists in the draft section in order', async () => {
    const many = Array.from({ length: 8 }, (_, i) => stack(`s${i}`, `Section ${i + 1}`))
    load(many)
    render(<EditorShell />)
    const user = userEvent.setup()
    const lib = await goTo(user, 'Components')
    await user.selectOptions(lib.getByLabelText('Add to section'), 'Section 8 · stack')
    await user.click(lib.getByRole('button', { name: 'Add Tasks' }))
    expect(sectionOf('s7').widgets.map((w) => w.type)).toEqual(['notes', 'tasks'])
    for (let i = 0; i < 7; i += 1) expect(sectionOf(`s${i}`).widgets).toHaveLength(1)
  })

  it('with no visible section, Add is not offered and recovery is: nothing is unhidden, created or saved', async () => {
    load([stack('a', 'Hidden A', { hidden: true }), stack('b', 'Hidden B', { hidden: true })])
    render(<EditorShell />)
    const user = userEvent.setup()
    const draft = editor().draftConfig
    const lib = await goTo(user, 'Components')
    expect(lib.getByText(/Every section is hidden/)).toBeInTheDocument()
    expect(lib.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument()
    await user.click(lib.getByRole('button', { name: 'Open outline' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveTextContent('Outline')
    expect(editor().draftConfig).toBe(draft)
  })

  it('never retargets silently when the chosen section is hidden or removed while open', async () => {
    load([grid('g', 'Dash'), stack('s', 'Reading')])
    render(<EditorShell />)
    const user = userEvent.setup()
    const lib = await goTo(user, 'Components')
    await user.selectOptions(lib.getByLabelText('Add to section'), 'Reading · stack')
    act(() => { editor().apply(setSectionHidden('s', true)) })
    const dialog = libraryDialog()
    expect(dialog.getAllByText(/no longer available/).length).toBeGreaterThan(0)
    const add = dialog.getByRole('button', { name: 'Add Tasks' })
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription(/no longer available/)
    const draft = editor().draftConfig
    await user.click(add)
    expect(editor().draftConfig).toBe(draft)
    expect(sectionOf('g').widgets).toHaveLength(1) // not redirected to Dash
    await user.selectOptions(dialog.getByLabelText('Add to section'), 'Dash · dashboard grid')
    await user.click(dialog.getByRole('button', { name: 'Add Tasks' }))
    expect(sectionOf('g').widgets.map((w) => w.type)).toEqual(['notes', 'tasks'])
  })

  it('rapid double activation adds one instance; Undo removes it and Cancel restores the saved draft', async () => {
    load([stack('s', 'Reading')])
    render(<EditorShell />)
    const user = userEvent.setup()
    const lib = await goTo(user, 'Components')
    await user.dblClick(lib.getByRole('button', { name: 'Add Tasks' }))
    expect(sectionOf('s').widgets.map((w) => w.type)).toEqual(['notes', 'tasks'])
    expect(editor().history.past).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(sectionOf('s').widgets).toHaveLength(1)
    expect(selectIsDirty(editor())).toBe(false)
    const again = await goTo(user, 'Components')
    await user.click(again.getByRole('button', { name: 'Add Notes' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(sectionOf('s').widgets).toHaveLength(1)
  })

  it('a refused add keeps the dialog open with the message and leaves draft and history alone', async () => {
    load([stack('s', 'Reading')])
    render(<EditorShell />)
    const user = userEvent.setup()
    const lib = await goTo(user, 'Components')
    const draft = editor().draftConfig
    const history = editor().history
    const apply = vi.spyOn(editor(), 'apply').mockReturnValue({ status: 'rejected', error: 'Nope, refused.' })
    useEditorStore.setState({ apply })
    await user.click(lib.getByRole('button', { name: 'Add Tasks' }))
    expect(screen.getByRole('dialog', { name: 'Add a component' })).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Nope, refused.')
    expect(editor().draftConfig).toBe(draft)
    expect(editor().history).toBe(history)
    expect(screen.queryByTestId('add-confirmation')).not.toBeInTheDocument()
  })

  it('searching and choosing a destination are presentation only', async () => {
    load([grid('g', 'Dash'), stack('s', 'Reading')])
    render(<EditorShell />)
    const user = userEvent.setup()
    const draft = editor().draftConfig
    const lib = await goTo(user, 'Components')
    await user.selectOptions(lib.getByLabelText('Add to section'), 'Reading · stack')
    await user.type(lib.getByLabelText('Search components'), 'task')
    await user.keyboard('{Escape}')
    expect(editor().draftConfig).toBe(draft)
    expect(selectIsDirty(editor())).toBe(false)
    expect(editor().history.past).toHaveLength(0)
  })
})
