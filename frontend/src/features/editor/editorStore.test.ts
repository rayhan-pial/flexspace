import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setWorkspaceTitle, updateWidget } from '../../domain/workspace/commands'
import type { Command } from '../../domain/workspace/commands'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import type { WorkspaceConfig } from '../../domain/workspace/types'
import { selectIsDirty, useEditorStore } from './editorStore'

const editor = () => useEditorStore.getState()

function sampleConfig(title = 'Sample'): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title,
    sections: [
      {
        id: 's1', kind: 'grid', title: 'Main',
        widgets: [
          { id: 'w1', type: 'notes', title: 'Notes', props: { body: 'hello' } },
          { id: 'w2', type: 'welcome', props: { greeting: 'Hi' } },
        ],
        layout: [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }, { i: 'w2', x: 6, y: 0, w: 6, h: 3 }],
      },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.config
}

const load = (ownerId = 'alice', revision = 1, config = sampleConfig()) =>
  editor().load({ ownerId, workspaceId: `ws-${ownerId}`, revision, config })

const dirty = () => selectIsDirty(editor())
const edit = (title: string) => editor().apply(setWorkspaceTitle(title))

beforeEach(() => useEditorStore.setState(useEditorStore.getInitialState(), true))
afterEach(() => vi.restoreAllMocks())

describe('load', () => {
  it('stores separate deep copies as saved baseline and draft', () => {
    const input = sampleConfig()
    load('alice', 3, input)
    const { savedConfig, draftConfig } = editor()
    expect(savedConfig).toEqual(input)
    expect(draftConfig).toEqual(input)
    expect(savedConfig).not.toBe(draftConfig)
    expect(savedConfig!.sections).not.toBe(draftConfig!.sections)
    expect(savedConfig).not.toBe(input)
    expect(editor()).toMatchObject({ ownerId: 'alice', workspaceId: 'ws-alice', revision: 3, mode: 'edit', selection: null })
    expect(dirty()).toBe(false)
  })

  it('is not affected by later changes to the object it was given', () => {
    const input = sampleConfig()
    load('alice', 1, input)
    input.title = 'mutated after load'
    expect(editor().savedConfig!.title).toBe('Sample')
    expect(editor().draftConfig!.title).toBe('Sample')
  })

  it('freezes saved and draft so accidental mutation throws instead of corrupting the baseline', () => {
    load()
    expect(() => { (editor().draftConfig as WorkspaceConfig).title = 'x' }).toThrow(TypeError)
    expect(() => { (editor().savedConfig as WorkspaceConfig).sections[0].widgets[0].title = 'x' }).toThrow(TypeError)
  })

  it('replaces everything, including unsaved edits and selection, when loading again', () => {
    load('alice')
    edit('Unsaved')
    editor().select({ kind: 'widget', id: 'w1' })
    load('alice', 2)
    expect(editor()).toMatchObject({ revision: 2, selection: null, saveStatus: { state: 'idle' } })
    expect(editor().draftConfig!.title).toBe('Sample')
  })
})

describe('commands and dirty state', () => {
  it('change the draft only and leave the saved baseline untouched', () => {
    load()
    const saved = editor().savedConfig
    expect(edit('Renamed')).toEqual({ status: 'applied' })
    expect(editor().draftConfig!.title).toBe('Renamed')
    expect(editor().savedConfig).toBe(saved)
    expect(editor().savedConfig!.title).toBe('Sample')
    expect(editor().revision).toBe(1)
    expect(dirty()).toBe(true)
  })

  it('dirty is a real comparison: editing back to the saved value is clean again', () => {
    load()
    edit('Changed')
    expect(dirty()).toBe(true)
    edit('Sample')
    expect(dirty()).toBe(false)
    editor().apply(updateWidget('w1', { props: { body: 'x' } }))
    expect(dirty()).toBe(true)
    editor().apply(updateWidget('w1', { props: { body: 'hello' } }))
    expect(dirty()).toBe(false)
  })

  it('a no-op command changes nothing', () => {
    load()
    const draft = editor().draftConfig
    expect(edit('Sample')).toEqual({ status: 'noop' })
    expect(editor().apply(updateWidget('w1', { title: 'Notes' }))).toEqual({ status: 'noop' })
    expect(editor().draftConfig).toBe(draft)
    expect(dirty()).toBe(false)
  })

  it('a command that deep-equals the draft is treated as a no-op even with a new object', () => {
    load()
    const draft = editor().draftConfig
    expect(editor().apply((c) => ({ ok: true, config: structuredClone(c) }))).toEqual({ status: 'noop' })
    expect(editor().draftConfig).toBe(draft)
  })

  it('a failed command is rejected without touching the draft', () => {
    load()
    const draft = editor().draftConfig
    expect(editor().apply(updateWidget('nope', { title: 'x' }))).toEqual({ status: 'rejected', error: 'Widget nope was not found.' })
    expect(editor().draftConfig).toBe(draft)
    expect(dirty()).toBe(false)
  })

  it('a command producing an invalid document is rejected, so the draft is always savable', () => {
    load()
    const draft = editor().draftConfig
    const outcome = edit('x'.repeat(121))
    expect(outcome.status).toBe('rejected')
    expect(editor().draftConfig).toBe(draft)
    const badColor = editor().apply((c) => ({ ok: true, config: { ...c, theme: { ...c.theme, primary: 'red' } } }))
    expect(badColor.status).toBe('rejected')
    expect(dirty()).toBe(false)
  })

  it('a command producing a non-canonical document (missing defaults) is rejected', () => {
    load()
    const sloppy: Command = (c) => ({ ok: true, config: { ...c, theme: { primary: '#112233' } } as unknown as WorkspaceConfig })
    const outcome = editor().apply(sloppy)
    expect(outcome).toMatchObject({ status: 'rejected' })
    expect(editor().draftConfig!.theme.fontFamily).toBe('system')
  })

  it('a command that tries to mutate the frozen draft throws rather than corrupting state', () => {
    load()
    const mutating: Command = (c) => {
      c.title = 'mutated'
      return { ok: true, config: c }
    }
    expect(() => editor().apply(mutating)).toThrow(TypeError)
    expect(editor().draftConfig!.title).toBe('Sample')
    expect(editor().savedConfig!.title).toBe('Sample')
  })

  it('structurally shares untouched branches between successive drafts', () => {
    load()
    const before = editor().draftConfig!
    editor().apply(updateWidget('w1', { props: { body: 'new' } }))
    const after = editor().draftConfig!
    expect(after).not.toBe(before)
    expect(after.sections[0].widgets[1]).toBe(before.sections[0].widgets[1])
    expect(after.theme).toBe(before.theme)
    expect(before.sections[0].widgets[0].props).toEqual({ body: 'hello' }) // previous draft intact
  })

  it('rejects commands when nothing is loaded', () => {
    expect(edit('x')).toEqual({ status: 'rejected', error: 'No workspace is loaded.' })
  })

  it('works in preview mode too (task checks and note edits there change the same draft)', () => {
    load()
    editor().setMode('preview')
    expect(editor().apply(updateWidget('w1', { props: { body: 'edited in preview' } }))).toEqual({ status: 'applied' })
    expect(dirty()).toBe(true)
  })
})

describe('mode and selection', () => {
  it('switching mode changes only the mode', () => {
    load()
    edit('Edited')
    editor().select({ kind: 'widget', id: 'w1' })
    const { draftConfig, savedConfig, revision, saveStatus } = editor()
    editor().setMode('preview')
    editor().setMode('edit')
    expect(editor()).toMatchObject({ draftConfig, savedConfig, revision, saveStatus, selection: { kind: 'widget', id: 'w1' }, mode: 'edit' })
    expect(dirty()).toBe(true)
  })
})

describe('cancel', () => {
  it('restores the saved baseline and clears selection, gesture and save error', () => {
    load()
    edit('Unsaved')
    editor().select({ kind: 'section', id: 's1' })
    editor().beginGesture('grid')
    expect(editor().cancel()).toBe(true)
    expect(editor().draftConfig).toEqual(editor().savedConfig)
    expect(editor().draftConfig!.title).toBe('Sample')
    expect(editor()).toMatchObject({ selection: null, interaction: { gesture: null }, saveStatus: { state: 'idle' } })
    expect(dirty()).toBe(false)
  })

  it('later edits after cancel never leak into the saved baseline', () => {
    load()
    edit('Unsaved')
    editor().cancel()
    edit('Second edit')
    expect(editor().savedConfig!.title).toBe('Sample')
  })

  it('is refused while a save is in flight', () => {
    load()
    edit('Unsaved')
    editor().beginSave()
    expect(editor().cancel()).toBe(false)
    expect(editor().draftConfig!.title).toBe('Unsaved')
  })

  it('does nothing when no workspace is loaded', () => {
    expect(editor().cancel()).toBe(false)
  })
})

describe('save lifecycle', () => {
  it('beginSave captures an immutable snapshot, base revision and owner, and marks saving', () => {
    load('alice', 4)
    edit('Snapshot title')
    const ticket = editor().beginSave()!
    expect(ticket).toMatchObject({ ownerId: 'alice', baseRevision: 4, epoch: editor().epoch })
    expect(ticket.snapshot.title).toBe('Snapshot title')
    expect(editor().saveStatus).toEqual({ state: 'saving' })
    edit('Edited while saving')
    expect(ticket.snapshot.title).toBe('Snapshot title') // the submitted snapshot cannot change
    expect(() => { (ticket.snapshot as WorkspaceConfig).title = 'x' }).toThrow(TypeError)
  })

  it('blocks duplicate saves while one is in flight', () => {
    load()
    edit('x')
    expect(editor().beginSave()).not.toBeNull()
    expect(editor().beginSave()).toBeNull()
  })

  it('refuses to save when clean, unloaded or mid-gesture', () => {
    expect(editor().beginSave()).toBeNull()
    load()
    expect(editor().beginSave()).toBeNull() // not dirty
    edit('x')
    expect(editor().beginGesture('grid')).toBe(true)
    expect(editor().beginGesture('sort')).toBe(false) // one gesture at a time
    expect(editor().beginSave()).toBeNull()
    editor().endGesture()
    expect(editor().beginSave()).not.toBeNull()
  })

  it('success with no newer edits makes saved and draft identical and clean', () => {
    load('alice', 1)
    edit('Saved title')
    const ticket = editor().beginSave()!
    expect(editor().saveSucceeded(ticket, { revision: 2, config: ticket.snapshot })).toBe('applied')
    expect(editor()).toMatchObject({ revision: 2, saveStatus: { state: 'idle' } })
    expect(editor().savedConfig!.title).toBe('Saved title')
    expect(editor().draftConfig).toBe(editor().savedConfig)
    expect(dirty()).toBe(false)
  })

  it('success keeps edits made during the save, and they stay dirty against the new baseline', () => {
    load('alice', 1)
    edit('Submitted')
    const ticket = editor().beginSave()!
    edit('Typed during save')
    editor().apply(updateWidget('w1', { props: { body: 'also changed' } }))
    editor().saveSucceeded(ticket, { revision: 2, config: ticket.snapshot })
    expect(editor().savedConfig!.title).toBe('Submitted')
    expect(editor().draftConfig!.title).toBe('Typed during save')
    expect(editor().draftConfig!.sections[0].widgets[0].props).toEqual({ body: 'also changed' })
    expect(dirty()).toBe(true)
    expect(editor().revision).toBe(2)
    expect(editor().beginSave()).toMatchObject({ baseRevision: 2 }) // the next save builds on the new revision
  })

  it('an edit made during the save that is reverted before the response is treated as unchanged', () => {
    load()
    edit('Submitted')
    const ticket = editor().beginSave()!
    edit('Temporary')
    edit('Submitted')
    editor().saveSucceeded(ticket, { revision: 2, config: ticket.snapshot })
    expect(dirty()).toBe(false)
  })

  it('uses the server\'s canonical config as the new baseline', () => {
    load()
    edit('Submitted')
    const ticket = editor().beginSave()!
    const canonical = structuredClone(ticket.snapshot)
    canonical.theme.fontSizePx = 17
    editor().saveSucceeded(ticket, { revision: 2, config: canonical })
    expect(editor().savedConfig!.theme.fontSizePx).toBe(17)
    expect(editor().draftConfig).toBe(editor().savedConfig)
  })

  it('failure keeps saved, draft and revision, records a retryable error and allows retry', () => {
    load('alice', 5)
    edit('Will fail')
    const saved = editor().savedConfig
    const draft = editor().draftConfig
    const ticket = editor().beginSave()!
    expect(editor().saveFailed(ticket, { kind: 'network', message: 'offline' })).toBe('applied')
    expect(editor()).toMatchObject({ revision: 5, saveStatus: { state: 'error', kind: 'network', message: 'offline' } })
    expect(editor().savedConfig).toBe(saved)
    expect(editor().draftConfig).toBe(draft)
    expect(dirty()).toBe(true)
    expect(editor().beginSave()).toMatchObject({ baseRevision: 5 }) // retry
  })

  it('a conflict records the current revision and never replaces or merges the draft', () => {
    load('alice', 3)
    edit('Mine')
    const draft = editor().draftConfig
    const ticket = editor().beginSave()!
    editor().saveFailed(ticket, { kind: 'conflict', message: 'changed elsewhere', currentRevision: 7 })
    expect(editor().saveStatus).toEqual({ state: 'error', kind: 'conflict', message: 'changed elsewhere', currentRevision: 7 })
    expect(editor().draftConfig).toBe(draft)
    expect(editor().revision).toBe(3)
  })

  it('editing continues after a failure, and the error can be dismissed', () => {
    load()
    edit('First')
    const ticket = editor().beginSave()!
    editor().saveFailed(ticket, { kind: 'server', message: 'boom' })
    expect(edit('Second')).toEqual({ status: 'applied' })
    editor().dismissSaveError()
    expect(editor().saveStatus).toEqual({ state: 'idle' })
  })

  it('cancel after a failed save restores the baseline and clears the error', () => {
    load()
    edit('x')
    editor().saveFailed(editor().beginSave()!, { kind: 'network', message: 'offline' })
    expect(editor().cancel()).toBe(true)
    expect(editor().saveStatus).toEqual({ state: 'idle' })
    expect(dirty()).toBe(false)
  })
})

describe('owner and generation guards', () => {
  it('ignores a save result that arrives after loading another account', () => {
    load('alice', 1)
    edit('Alice edit')
    const ticket = editor().beginSave()!
    load('bob', 9, sampleConfig('Bob workspace'))
    expect(editor().saveSucceeded(ticket, { revision: 2, config: ticket.snapshot })).toBe('ignored')
    expect(editor().saveFailed(ticket, { kind: 'network', message: 'x' })).toBe('ignored')
    expect(editor()).toMatchObject({ ownerId: 'bob', revision: 9, saveStatus: { state: 'idle' } })
    expect(editor().savedConfig!.title).toBe('Bob workspace')
  })

  it('ignores a save result that arrives after reset (logout)', () => {
    load()
    edit('x')
    const ticket = editor().beginSave()!
    editor().reset()
    expect(editor().saveSucceeded(ticket, { revision: 2, config: ticket.snapshot })).toBe('ignored')
    expect(editor()).toMatchObject({ ownerId: null, savedConfig: null, draftConfig: null, revision: null })
  })

  it('ignores a result for the same owner after a reload started a new epoch', () => {
    load('alice', 1)
    edit('x')
    const ticket = editor().beginSave()!
    load('alice', 5) // e.g. the user reloaded the latest after a conflict
    expect(editor().saveSucceeded(ticket, { revision: 2, config: ticket.snapshot })).toBe('ignored')
    expect(editor().revision).toBe(5)
  })

  it('reset clears all owner-bound state', () => {
    load()
    edit('x')
    editor().select({ kind: 'widget', id: 'w1' })
    editor().beginGesture('grid')
    editor().setMode('preview')
    editor().reset()
    expect(editor()).toMatchObject({
      ownerId: null, workspaceId: null, revision: null, savedConfig: null, draftConfig: null,
      selection: null, mode: 'edit', interaction: { gesture: null }, saveStatus: { state: 'idle' },
    })
    expect(dirty()).toBe(false)
  })
})

describe('browser storage', () => {
  it('never persists the workspace, draft or history', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    load()
    edit('x')
    const ticket = editor().beginSave()!
    editor().saveSucceeded(ticket, { revision: 2, config: ticket.snapshot })
    editor().cancel()
    editor().reset()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })
})
