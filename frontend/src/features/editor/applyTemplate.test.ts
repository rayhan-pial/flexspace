import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { setWorkspaceTitle } from '../../domain/workspace/commands'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import type { WorkspaceConfig } from '../../domain/workspace/types'
import { applyTemplateConfig, replacementBlocker } from './applyTemplate'
import { selectIsDirty, useEditorStore } from './editorStore'
import { summarizeTemplate } from './templateSummary'

const FIXTURES = join(__dirname, '../../../../contracts/fixtures/valid')
const raw = (key: string) => JSON.parse(readFileSync(join(FIXTURES, `system-template-${key}.json`), 'utf-8')).input as unknown
const parsed = (key: string): WorkspaceConfig => {
  const result = parseWorkspaceConfig(raw(key))
  if (!result.ok) throw new Error(result.message)
  return result.config
}
const editor = () => useEditorStore.getState()

function loadUserWorkspace() {
  const own = parseWorkspaceConfig({
    schemaVersion: 1, title: 'My own workspace',
    sections: [{ id: 'mine', kind: 'stack', title: 'Mine', widgets: [{ id: 'my-note', type: 'notes', props: { body: 'keep me' } }] }],
  })
  if (!own.ok) throw new Error(own.message)
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 4, config: own.config })
  return own.config
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
})

describe('applyTemplateConfig', () => {
  it.each(['productivity', 'analytics', 'creative'])('replaces only the draft with the %s design, as one change', (key) => {
    const own = loadUserWorkspace()
    const saved = editor().savedConfig
    const template = parsed(key)
    expect(applyTemplateConfig(raw(key))).toEqual({ ok: true })
    const draft = editor().draftConfig!
    expect(draft.title).toBe(template.title)
    expect(draft.sections.map((s) => [s.title, s.kind])).toEqual(template.sections.map((s) => [s.title, s.kind]))
    expect(draft.sections.map((s) => s.id)).not.toContain('mine')
    // Nothing but the draft moved: the saved baseline and revision are exactly as they were.
    expect(editor().savedConfig).toBe(saved)
    expect(editor().savedConfig).toEqual(own)
    expect(editor().revision).toBe(4)
    expect(selectIsDirty(editor())).toBe(true)
  })

  it('assigns new ids, so the draft never contains the template ids', () => {
    loadUserWorkspace()
    const templateIds = JSON.stringify(raw('productivity'))
    applyTemplateConfig(raw('productivity'))
    const draftJson = JSON.stringify(editor().draftConfig)
    for (const id of ['section-today', 'w-welcome', 'w-tasks', 'task-1', 'nav-section-today', 'event-1']) {
      expect(templateIds).toContain(`"${id}"`)
      expect(draftJson).not.toContain(`"${id}"`)
    }
  })

  it('Cancel restores the prior saved baseline', () => {
    const own = loadUserWorkspace()
    applyTemplateConfig(raw('creative'))
    expect(editor().draftConfig!.title).toBe('Creative workspace')
    expect(editor().cancel()).toBe(true)
    expect(editor().draftConfig).toEqual(own)
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('clears a selection that pointed at something the template replaced', () => {
    loadUserWorkspace()
    editor().select({ kind: 'widget', id: 'my-note' })
    applyTemplateConfig(raw('analytics'))
    expect(editor().selection).toBeNull()
  })

  it('applying the same template twice gives two documents with no id in common', () => {
    loadUserWorkspace()
    applyTemplateConfig(raw('productivity'))
    const first = JSON.stringify(editor().draftConfig!.sections.map((s) => [s.id, s.widgets.map((w) => w.id)]))
    applyTemplateConfig(raw('productivity'))
    const second = JSON.stringify(editor().draftConfig!.sections.map((s) => [s.id, s.widgets.map((w) => w.id)]))
    expect(first).not.toBe(second)
  })

  it('refuses while a save is in flight, while frozen, during a drag and with nothing loaded', () => {
    expect(applyTemplateConfig(raw('productivity'))).toEqual({ ok: false, message: 'No workspace is loaded.' })

    loadUserWorkspace()
    editor().apply(setWorkspaceTitle('Edited'))
    const before = editor().draftConfig
    editor().beginSave() // a save is now in flight
    const saving = applyTemplateConfig(raw('productivity'))
    expect(saving).toEqual({ ok: false, message: 'Wait for the save to finish before replacing the workspace.' })
    expect(editor().draftConfig).toBe(before)

    useEditorStore.setState(useEditorStore.getInitialState(), true)
    loadUserWorkspace()
    editor().beginGesture('sort')
    expect(applyTemplateConfig(raw('productivity')).ok).toBe(false)
    editor().endGesture()
    editor().freeze()
    expect(applyTemplateConfig(raw('productivity'))).toEqual({ ok: false, message: 'Your session expired. Sign in again to continue.' })
  })

  it('reports why, as a plain reason, in replacementBlocker', () => {
    expect(replacementBlocker(editor())).toBe('No workspace is loaded.')
    loadUserWorkspace()
    expect(replacementBlocker(editor())).toBeNull()
  })

  it('refuses an unreadable or too-new template and changes nothing', () => {
    const own = loadUserWorkspace()
    const draft = editor().draftConfig
    expect(applyTemplateConfig({ schemaVersion: 1 })).toEqual({ ok: false, message: 'This template could not be read, so nothing was changed.' })
    expect(applyTemplateConfig({ ...(raw('productivity') as object), schemaVersion: 2 })).toEqual({
      ok: false, message: 'This template was made with a newer version of FlexSpace and cannot be applied here.',
    })
    expect(applyTemplateConfig(null).ok).toBe(false)
    expect(applyTemplateConfig('not a config').ok).toBe(false)
    expect(editor().draftConfig).toBe(draft)
    expect(editor().draftConfig).toEqual(own)
    expect(selectIsDirty(editor())).toBe(false)
  })
})

describe('summarizeTemplate', () => {
  it('describes each design in words', () => {
    const analytics = summarizeTemplate(parsed('analytics'))
    expect(analytics.title).toBe('Analytics workspace')
    expect(analytics.placement).toBe('top')
    expect(analytics.navigation).toEqual(['Overview', 'Reports', 'Notes'])
    expect(analytics.sections.map((s) => [s.title, s.kind])).toEqual([['Overview', 'grid'], ['Reports', 'stack'], ['Notes', 'stack']])
    expect(analytics.sections[0].widgets).toEqual(['Overview', 'Key metrics', 'Engagement', 'Follow-ups', 'Reporting calendar'])
    expect(analytics.widgetCount).toBe(9)
    expect(analytics.theme.primary).toBe('#0ea5e9')
    const creative = summarizeTemplate(parsed('creative'))
    expect(creative.placement).toBe('right')
    expect(creative.theme.fontFamily).toBe('serif')
  })

  it('falls back to type labels for untitled widgets and a name for untitled sections', () => {
    const config = parseWorkspaceConfig({
      schemaVersion: 1, title: 'T',
      sections: [{ id: 's', kind: 'stack', title: '', widgets: [{ id: 'a', type: 'notes' }, { id: 'b', type: 'kanban' }] }],
    })
    if (!config.ok) throw new Error(config.message)
    expect(summarizeTemplate(config.config).sections).toEqual([{ title: 'Untitled section', kind: 'stack', widgets: ['Notes', 'Unsupported widget'] }])
  })
})
