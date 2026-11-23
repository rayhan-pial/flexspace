import { beforeEach, describe, expect, it } from 'vitest'
import { replaceWorkspace, setWorkspaceTitle } from '../../domain/workspace/commands'
import { addWidget } from '../../domain/workspace/lifecycle'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import type { WorkspaceConfig } from '../../domain/workspace/types'
import { HISTORY_LIMIT, selectCanRedo, selectCanUndo, selectIsDirty, useEditorStore } from './editorStore'

const editor = () => useEditorStore.getState()

function sample(title = 'Start'): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title,
    sections: [{ id: 's1', kind: 'stack', title: 'Main', widgets: [{ id: 'w1', type: 'notes', title: 'Notes', props: { body: 'hello' } }] }],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.config
}
const load = (revision = 1) => editor().load({ ownerId: 'a', workspaceId: 'ws', revision, config: sample() })
const title = () => editor().draftConfig!.title
const rename = (name: string) => editor().apply(setWorkspaceTitle(name))
const dirty = () => selectIsDirty(editor())

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  load()
})

describe('steps', () => {
  it('starts empty: nothing to undo or redo', () => {
    expect(selectCanUndo(editor())).toBe(false)
    expect(selectCanRedo(editor())).toBe(false)
    expect(editor().undo()).toBe(false)
    expect(editor().redo()).toBe(false)
  })

  it('one command is one step; undo and redo walk through them', () => {
    rename('One')
    rename('Two')
    expect(editor().undo()).toBe(true)
    expect(title()).toBe('One')
    expect(editor().undo()).toBe(true)
    expect(title()).toBe('Start')
    expect(editor().undo()).toBe(false)
    expect(editor().redo()).toBe(true)
    expect(title()).toBe('One')
    expect(editor().redo()).toBe(true)
    expect(title()).toBe('Two')
    expect(editor().redo()).toBe(false)
  })

  it('restores the very same draft object, so undoing to the saved version is clean again', () => {
    const before = editor().draftConfig
    rename('Changed')
    expect(dirty()).toBe(true)
    editor().undo()
    expect(editor().draftConfig).toBe(before)
    expect(dirty()).toBe(false)
  })

  it('a new change clears the redo trail', () => {
    rename('One')
    editor().undo()
    expect(selectCanRedo(editor())).toBe(true)
    rename('Other')
    expect(selectCanRedo(editor())).toBe(false)
    expect(editor().redo()).toBe(false)
    expect(title()).toBe('Other')
  })

  it('no-op, rejected and invalid commands record nothing', () => {
    rename('Start') // same title: no-op
    editor().apply(() => ({ ok: false, error: 'nope' }))
    rename('x'.repeat(500)) // too long for a title
    expect(selectCanUndo(editor())).toBe(false)
  })

  it('a template application (replaceWorkspace) is a single step', () => {
    editor().apply(replaceWorkspace(sample('From template')))
    expect(title()).toBe('From template')
    editor().undo()
    expect(title()).toBe('Start')
    expect(selectCanUndo(editor())).toBe(false)
  })

  it('keeps at most 30 earlier drafts and forgets the oldest', () => {
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) rename(`T${i}`)
    expect(editor().history.past).toHaveLength(HISTORY_LIMIT)
    let undone = 0
    while (editor().undo()) undone++
    expect(undone).toBe(HISTORY_LIMIT)
    expect(title()).toBe('T5') // T1..T4 and the original fell off the end
  })

  it('redo also respects the limit', () => {
    for (let i = 1; i <= HISTORY_LIMIT; i++) rename(`T${i}`)
    while (editor().undo()) {
      /* walk back to the oldest */
    }
    while (editor().redo()) {
      /* and forward again */
    }
    expect(title()).toBe(`T${HISTORY_LIMIT}`)
    expect(editor().history.past.length).toBeLessThanOrEqual(HISTORY_LIMIT)
  })
})

describe('sessions: one text edit or colour drag is one step', () => {
  it('groups every command of a session into a single step', () => {
    editor().beginEditSession()
    for (const name of ['A', 'AB', 'ABC', 'ABCD']) rename(name)
    editor().endEditSession()
    expect(title()).toBe('ABCD')
    editor().undo()
    expect(title()).toBe('Start')
    expect(selectCanUndo(editor())).toBe(false)
    editor().redo()
    expect(title()).toBe('ABCD')
  })

  it('two sessions are two steps, and a plain command between them is its own step', () => {
    editor().beginEditSession()
    rename('A')
    rename('AB')
    editor().endEditSession()
    editor().apply(addWidget('s1', 'notes', 'w-new'))
    editor().beginEditSession()
    rename('Z')
    rename('ZZ')
    editor().endEditSession()
    expect(editor().history.past).toHaveLength(3)
  })

  it('a session that changed nothing records nothing', () => {
    editor().beginEditSession()
    editor().endEditSession()
    expect(selectCanUndo(editor())).toBe(false)
  })

  it('beginning twice does not split the step', () => {
    editor().beginEditSession()
    rename('A')
    editor().beginEditSession()
    rename('AB')
    editor().endEditSession()
    expect(editor().history.past).toHaveLength(1)
  })

  it('undo ends an open session, so the next edit is a new step', () => {
    rename('One')
    editor().beginEditSession()
    rename('Two')
    editor().undo()
    rename('Three')
    expect(editor().history.past).toHaveLength(2)
  })
})

describe('draft only: nothing is saved, nothing is sent', () => {
  it('leaves the saved baseline, revision and save status untouched', () => {
    const saved = editor().savedConfig
    rename('One')
    rename('Two')
    editor().undo()
    editor().redo()
    expect(editor().savedConfig).toBe(saved)
    expect(editor().revision).toBe(1)
    expect(editor().saveStatus).toEqual({ state: 'idle' })
  })

  it('undoing a saved change makes the workspace dirty again, without rewriting history', () => {
    rename('Saved title')
    const ticket = editor().beginSave()!
    editor().saveSucceeded(ticket, { revision: 2, config: editor().draftConfig! })
    expect(dirty()).toBe(false)
    expect(editor().history.past).toHaveLength(1) // a save does not clear it
    editor().undo()
    expect(title()).toBe('Start')
    expect(dirty()).toBe(true)
    editor().redo()
    expect(dirty()).toBe(false)
  })

  it('edits made while a save is in flight can be undone, and the save result still keeps them', () => {
    rename('Sent')
    const ticket = editor().beginSave()!
    rename('Newer')
    editor().undo()
    expect(title()).toBe('Sent')
    editor().saveSucceeded(ticket, { revision: 2, config: ticket.snapshot })
    expect(title()).toBe('Sent')
    expect(dirty()).toBe(false)
  })
})

describe('where history ends', () => {
  it('Cancel clears both stacks and restores the saved version', () => {
    rename('One')
    rename('Two')
    editor().undo()
    expect(editor().cancel()).toBe(true)
    expect(title()).toBe('Start')
    expect(selectCanUndo(editor())).toBe(false)
    expect(selectCanRedo(editor())).toBe(false)
  })

  it('loading another workspace or resetting clears them', () => {
    rename('One')
    load(2)
    expect(selectCanUndo(editor())).toBe(false)
    rename('Two')
    editor().reset()
    expect(editor().history.past).toHaveLength(0)
    expect(editor().history.future).toHaveLength(0)
  })

  it('a different user never inherits the previous history', () => {
    rename('Alice edit')
    editor().load({ ownerId: 'b', workspaceId: 'ws-b', revision: 1, config: sample('Bob') })
    expect(selectCanUndo(editor())).toBe(false)
    expect(editor().undo()).toBe(false)
    expect(title()).toBe('Bob')
  })

  it('is refused while the session is frozen, and while a drag is running', () => {
    rename('One')
    editor().freeze()
    expect(selectCanUndo(editor())).toBe(false)
    expect(editor().undo()).toBe(false)
    expect(title()).toBe('One')
    editor().unfreeze()
    editor().beginGesture('sort')
    expect(selectCanUndo(editor())).toBe(false)
    expect(editor().undo()).toBe(false)
    editor().endGesture()
    expect(editor().undo()).toBe(true)
  })
})

describe('selection and wording', () => {
  it('drops a selection that the undone change had created', () => {
    editor().apply(addWidget('s1', 'notes', 'w-new'))
    editor().select({ kind: 'widget', id: 'w-new' })
    editor().undo()
    expect(editor().selection).toBeNull()
  })

  it('keeps a selection that still exists', () => {
    editor().select({ kind: 'widget', id: 'w1' })
    rename('One')
    editor().undo()
    expect(editor().selection).toEqual({ kind: 'widget', id: 'w1' })
  })

  it('says what happened, and a new change clears the note', () => {
    rename('One')
    editor().undo()
    expect(editor().history.note).toBe('Undid the last change.')
    editor().redo()
    expect(editor().history.note).toBe('Redid the change.')
    rename('Two')
    expect(editor().history.note).toBe('')
  })
})
