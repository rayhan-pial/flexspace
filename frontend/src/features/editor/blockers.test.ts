import { beforeEach, describe, expect, it } from 'vitest'
import { setWorkspaceTitle } from '../../domain/workspace/commands'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { cancelBlocker, historyBlocker, saveBlocker, useEditorStore } from './editorStore'

const editor = () => useEditorStore.getState()
function load() {
  const parsed = parseWorkspaceConfig({ schemaVersion: 1, title: 'Start', sections: [{ id: 's1', kind: 'stack', title: 'Main', widgets: [{ id: 'w1', type: 'notes' }] }] })
  if (!parsed.ok) throw new Error(parsed.message)
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
}

beforeEach(() => useEditorStore.setState(useEditorStore.getInitialState(), true))

describe('action blockers (UI-022)', () => {
  it('explain why nothing can run on a clean workspace, without changing anything', () => {
    load()
    const before = editor().draftConfig
    expect(saveBlocker(editor())).toBe('There are no unsaved changes.')
    expect(cancelBlocker(editor())).toBe('There are no unsaved changes to discard.')
    expect(historyBlocker(editor(), 'undo')).toBe('There is nothing to undo.')
    expect(historyBlocker(editor(), 'redo')).toBe('There is nothing to redo.')
    expect(editor().draftConfig).toBe(before)
    expect(editor().history.past).toHaveLength(0)
  })

  it('become available after an edit and report the gesture, saving, reloading and frozen states', () => {
    load()
    editor().apply(setWorkspaceTitle('Changed'))
    expect(saveBlocker(editor())).toBeNull()
    expect(cancelBlocker(editor())).toBeNull()
    expect(historyBlocker(editor(), 'undo')).toBeNull()
    editor().beginGesture('grid')
    expect(saveBlocker(editor())).toBe('Finish the drag or resize first.')
    expect(historyBlocker(editor(), 'undo')).toBe('Finish the drag or resize first.')
    editor().endGesture()
    editor().beginSave()
    expect(saveBlocker(editor())).toBe('A save is already in progress.')
    expect(cancelBlocker(editor())).toBe('A save is in progress.')
    useEditorStore.setState({ saveStatus: { state: 'idle' } })
    expect(editor().beginReload()).not.toBeNull()
    expect(saveBlocker(editor())).toBe('The latest saved workspace is loading.')
    useEditorStore.setState({ reloading: false })
    editor().freeze()
    expect(saveBlocker(editor())).toBe('Sign in again to keep editing.')
    expect(historyBlocker(editor(), 'redo')).toBe('Sign in again to keep editing.')
  })
})
