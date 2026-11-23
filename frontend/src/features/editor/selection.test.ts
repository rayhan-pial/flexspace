import { beforeEach, describe, expect, it } from 'vitest'
import type { Command } from '../../domain/workspace/commands'
import { updateWidget } from '../../domain/workspace/commands'
import { setWidgetHidden } from '../../domain/workspace/lifecycle'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import type { WorkspaceConfig } from '../../domain/workspace/types'
import { useEditorStore } from './editorStore'
import { resolveSelection } from './selection'

const editor = () => useEditorStore.getState()

function sampleConfig(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Sample',
    navigation: {
      primaryItems: [{ id: 'nav-1', label: 'Overview', targetSectionId: 's1' }],
      secondaryItems: [{ id: 'nav-2', label: 'More', targetSectionId: null }],
    },
    sections: [
      {
        id: 's1', kind: 'grid', title: 'Main',
        widgets: [
          { id: 'w1', type: 'notes', props: { body: 'a' } },
          { id: 'w2', type: 'notes', props: { body: 'b' } },
        ],
        layout: [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }, { i: 'w2', x: 6, y: 0, w: 6, h: 4 }],
      },
      { id: 's2', kind: 'stack', title: 'Second', widgets: [{ id: 'w3', type: 'notes', hidden: true, props: { body: 'c' } }] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.config
}

const removeWidget = (id: string): Command => (config) => ({
  ok: true,
  config: {
    ...config,
    sections: config.sections.map((section) => ({
      ...section,
      widgets: section.widgets.filter((w) => w.id !== id),
      ...(section.layout && { layout: section.layout.filter((r) => r.i !== id) }),
    })),
  },
})
const removeSection = (id: string): Command => (config) => ({
  ok: true,
  config: {
    ...config,
    sections: config.sections.filter((s) => s.id !== id),
    navigation: {
      ...config.navigation,
      primaryItems: config.navigation.primaryItems.map((n) => (n.targetSectionId === id ? { ...n, targetSectionId: null } : n)),
    },
  },
})
const removeNavItem = (id: string): Command => (config) => ({
  ok: true,
  config: { ...config, navigation: { ...config.navigation, primaryItems: config.navigation.primaryItems.filter((n) => n.id !== id) } },
})

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  editor().load({ ownerId: 'a', workspaceId: 'ws', revision: 1, config: sampleConfig() })
})

describe('resolveSelection', () => {
  const config = sampleConfig()

  it('resolves widgets (including hidden ones), sections and navigation items by ID', () => {
    expect(resolveSelection(config, { kind: 'widget', id: 'w2' })).toMatchObject({ kind: 'widget', widget: { id: 'w2' }, section: { id: 's1' } })
    expect(resolveSelection(config, { kind: 'widget', id: 'w3' })).toMatchObject({ kind: 'widget', widget: { id: 'w3', hidden: true } })
    expect(resolveSelection(config, { kind: 'section', id: 's2' })).toMatchObject({ kind: 'section', section: { id: 's2' } })
    expect(resolveSelection(config, { kind: 'navItem', id: 'nav-2' })).toMatchObject({ kind: 'navItem', item: { id: 'nav-2' } })
  })

  it('returns null for missing targets, wrong kinds, and absent input', () => {
    expect(resolveSelection(config, { kind: 'widget', id: 'nope' })).toBeNull()
    expect(resolveSelection(config, { kind: 'section', id: 'w1' })).toBeNull() // a widget id is not a section
    expect(resolveSelection(config, { kind: 'widget', id: 's1' })).toBeNull()
    expect(resolveSelection(config, null)).toBeNull()
    expect(resolveSelection(null, { kind: 'widget', id: 'w1' })).toBeNull()
  })
})

describe('selection in the editor store', () => {
  it('selecting an existing target stores it; selecting a missing one selects nothing', () => {
    editor().select({ kind: 'widget', id: 'w1' })
    expect(editor().selection).toEqual({ kind: 'widget', id: 'w1' })
    editor().select({ kind: 'widget', id: 'ghost' })
    expect(editor().selection).toBeNull()
    editor().select({ kind: 'section', id: 's1' })
    editor().select(null)
    expect(editor().selection).toBeNull()
  })

  it('removing the selected widget clears the selection', () => {
    editor().select({ kind: 'widget', id: 'w1' })
    expect(editor().apply(removeWidget('w1'))).toEqual({ status: 'applied' })
    expect(editor().selection).toBeNull()
  })

  it('removing the selected section or navigation item clears the selection', () => {
    editor().select({ kind: 'section', id: 's2' })
    editor().apply(removeSection('s2'))
    expect(editor().selection).toBeNull()
    editor().select({ kind: 'navItem', id: 'nav-1' })
    editor().apply(removeNavItem('nav-1'))
    expect(editor().selection).toBeNull()
  })

  it('removing a section removes the selection of a widget inside it', () => {
    editor().select({ kind: 'widget', id: 'w3' })
    editor().apply(removeSection('s2'))
    expect(editor().selection).toBeNull()
  })

  it('keeps the selection when an unrelated change happens or the target is only hidden', () => {
    editor().select({ kind: 'widget', id: 'w1' })
    editor().apply(removeWidget('w2'))
    expect(editor().selection).toEqual({ kind: 'widget', id: 'w1' })
    editor().apply(setWidgetHidden('w1', true))
    expect(editor().selection).toEqual({ kind: 'widget', id: 'w1' }) // hidden stays selectable to show it again
    editor().apply(updateWidget('w1', { props: { body: 'changed' } }))
    expect(editor().selection).toEqual({ kind: 'widget', id: 'w1' })
  })

  it('a rejected or no-op command leaves the selection alone', () => {
    editor().select({ kind: 'widget', id: 'w1' })
    expect(editor().apply(updateWidget('nope', { title: 'x' })).status).toBe('rejected')
    expect(editor().apply(setWidgetHidden('w1', false)).status).toBe('noop')
    expect(editor().selection).toEqual({ kind: 'widget', id: 'w1' })
  })

  it('Cancel, reload and reset clear the selection', () => {
    editor().select({ kind: 'widget', id: 'w1' })
    editor().apply(updateWidget('w1', { props: { body: 'x' } }))
    editor().cancel()
    expect(editor().selection).toBeNull()
    editor().select({ kind: 'widget', id: 'w1' })
    editor().load({ ownerId: 'a', workspaceId: 'ws', revision: 2, config: sampleConfig() })
    expect(editor().selection).toBeNull()
    editor().select({ kind: 'widget', id: 'w1' })
    editor().reset()
    expect(editor().selection).toBeNull()
  })

  it('cancelling an edit that removed the selected widget leaves no stale selection', () => {
    editor().apply(removeWidget('w1'))
    editor().select({ kind: 'widget', id: 'w2' })
    editor().cancel()
    expect(editor().selection).toBeNull()
    expect(editor().draftConfig!.sections[0].widgets.map((w) => w.id)).toEqual(['w1', 'w2'])
  })
})
