import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setTheme } from '../../domain/workspace/commands'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { stubViewport } from '../../test/viewport'
import { useEditorStore } from '../editor/editorStore'
import EditorShell from './EditorShell'

/* UI-024: the user's palette fills the whole workspace stage and navigation; the editor chrome keeps its own colors. */

const editor = () => useEditorStore.getState()
let viewport: ReturnType<typeof stubViewport>

function load(placement: 'top' | 'left' | 'right', widgetAppearance: Record<string, unknown> = {}) {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Stage',
    navigation: { placement, primaryItems: [{ id: 'n1', label: 'Overview', targetSectionId: 's1' }], secondaryItems: [] },
    sections: [{ id: 's1', kind: 'stack', title: 'Main', widgets: [{ id: 'w1', type: 'notes', title: 'Plain' }, { id: 'w2', type: 'notes', title: 'Custom', appearance: widgetAppearance }] }],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  viewport = stubViewport(true)
})
afterEach(() => viewport.restore())

const stage = () => document.querySelector<HTMLElement>('[data-workspace-stage]')!

describe('workspace stage', () => {
  it.each(['top', 'left', 'right'] as const)('is one themed area that holds the canvas and the %s navigation, in Edit and Preview', (placement) => {
    load(placement)
    render(<EditorShell />)
    expect(stage()).toHaveClass('fs-themed', 'flex-1')
    expect(stage().closest('#workspace-canvas')).not.toBeNull()
    expect(within(stage()).getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
    expect(stage().style.getPropertyValue('--fs-background')).not.toBe('')
    act(() => editor().setMode('preview'))
    expect(stage().closest('#workspace-canvas')).not.toBeNull()
    expect(within(stage()).getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
  })

  it('a palette recolors the stage variables in one undoable step and never touches editor chrome', () => {
    load('left')
    render(<EditorShell />)
    const before = stage().style.getPropertyValue('--fs-background')
    act(() => { editor().apply(setTheme({ primary: '#818cf8', background: '#0f172a', surface: '#1e293b', text: '#e2e8f0' })) })
    expect(stage().style.getPropertyValue('--fs-background')).toBe('#0f172a')
    expect(stage().style.getPropertyValue('--fs-surface')).toBe('#1e293b')
    expect(stage().style.getPropertyValue('--fs-text')).toBe('#e2e8f0')
    expect(stage().style.getPropertyValue('--fs-primary')).toBe('#818cf8')
    expect(editor().history.past).toHaveLength(1)
    const chrome = [screen.getByRole('complementary', { name: 'Inspector' }), screen.getByRole('navigation', { name: 'Editor navigation' }).closest('aside')!, document.querySelector('[data-toolbar]')!]
    for (const el of chrome) {
      expect((el as HTMLElement).closest('[data-workspace-stage]')).toBeNull()
      expect((el as HTMLElement).getAttribute('style') ?? '').not.toMatch(/--fs-/)
    }
    act(() => { editor().undo() })
    expect(stage().style.getPropertyValue('--fs-background')).toBe(before)
  })

  it('navigation labels follow the text color and icons the primary color', () => {
    load('left')
    render(<EditorShell />)
    const link = within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('button', { name: 'Overview' })
    expect(link.className).toContain('text-[color:var(--fs-text')
    expect(link.className).not.toMatch(/(^|\s)text-\[color:var\(--fs-primary/)
    expect(link.querySelector('svg')?.getAttribute('class')).toContain('--fs-primary')
  })

  it('keeps explicit widget colors when the palette changes', () => {
    load('top', { background: '#ff0000' })
    render(<EditorShell />)
    act(() => { editor().apply(setTheme({ primary: '#15803d', background: '#f0fdf4', surface: '#ffffff', text: '#14281d' })) })
    const custom = document.querySelector<HTMLElement>('[data-widget-id="w2"]')!
    expect(custom.style.backgroundColor).toBe('rgb(255, 0, 0)')
    expect(editor().draftConfig!.sections[0].widgets[1].appearance).toEqual({ background: '#ff0000' })
  })
})
