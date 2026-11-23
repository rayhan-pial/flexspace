import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { MAX_LIST_ITEMS, MAX_TEXT } from './constants'
import { deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import { addTask, removeTask, setTaskDone, setTaskText } from './tasks'
import type { TaskItem, WorkspaceConfig } from './types'

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Tasks',
    sections: [
      {
        id: 's1', kind: 'stack', title: 'Main',
        widgets: [
          { id: 'tw', type: 'tasks', props: { items: [{ id: 't1', text: 'First', done: false }, { id: 't2', text: 'Second', done: true }] } },
          { id: 'nw', type: 'notes', props: { body: 'x' } },
          { id: 'empty', type: 'tasks' },
        ],
      },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return deepFreeze(parsed.config)
}

function run(command: Command, from = sample()): WorkspaceConfig {
  const result = command(from)
  if (!result.ok) throw new Error(result.error)
  const parsed = parseWorkspaceConfig(result.config)
  expect(parsed.ok).toBe(true)
  if (parsed.ok) expect(parsed.config).toEqual(result.config)
  return result.config
}
const refusal = (command: Command, from = sample()) => {
  const result = command(from)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}
const items = (config: WorkspaceConfig, widget = 'tw') => config.sections[0].widgets.find((w) => w.id === widget)!.props.items as TaskItem[]

describe('addTask', () => {
  it('appends an unfinished, trimmed task with the given stable id', () => {
    const config = run(addTask('tw', 'new-1', '  Buy milk  '))
    expect(items(config).at(-1)).toEqual({ id: 'new-1', text: 'Buy milk', done: false })
    expect(items(config).slice(0, 2)).toEqual(items(sample()))
  })
  it('works on a widget that has no items yet', () => {
    expect(items(run(addTask('empty', 'e1', 'Hello')), 'empty')).toEqual([{ id: 'e1', text: 'Hello', done: false }])
  })
  it('refuses empty or blank text, over-long text, reused ids, the item limit and non-task widgets', () => {
    expect(refusal(addTask('tw', 'x', ''))).toMatch(/needs some text/)
    expect(refusal(addTask('tw', 'x', '   '))).toMatch(/needs some text/)
    expect(refusal(addTask('tw', 'x', 'a'.repeat(MAX_TEXT + 1)))).toMatch(/at most/)
    expect(run(addTask('tw', 'x', 'a'.repeat(MAX_TEXT))).sections).toBeDefined()
    for (const used of ['t1', 'tw', 's1', 'nw']) expect(refusal(addTask('tw', used, 'dup'))).toMatch(/already in use/)
    expect(refusal(addTask('nw', 'x', 'text'))).toMatch(/not a task list/)
    expect(refusal(addTask('missing', 'x', 'text'))).toMatch(/not found/)
    let config = sample()
    for (let n = items(config).length; n < MAX_LIST_ITEMS; n += 1) config = run(addTask('tw', `fill-${n}`, 'f'), config)
    expect(refusal(addTask('tw', 'over', 'f'), config)).toMatch(/at most 100/)
  })
})

describe('setTaskText', () => {
  it('renames by id without touching order, completion or the id', () => {
    const config = run(setTaskText('tw', 't1', '  Renamed '))
    expect(items(config)).toEqual([{ id: 't1', text: 'Renamed', done: false }, { id: 't2', text: 'Second', done: true }])
  })
  it('is a no-op for the same text, and refuses empty text and unknown tasks', () => {
    const before = sample()
    const same = setTaskText('tw', 't1', ' First ')(before)
    expect(same.ok && same.config).toBe(before)
    expect(refusal(setTaskText('tw', 't1', ' '))).toMatch(/needs some text/)
    expect(refusal(setTaskText('tw', 'nope', 'x'))).toMatch(/not found/)
  })
})

describe('setTaskDone', () => {
  it('checks and unchecks by id', () => {
    expect(items(run(setTaskDone('tw', 't1', true))).map((t) => t.done)).toEqual([true, true])
    expect(items(run(setTaskDone('tw', 't2', false))).map((t) => t.done)).toEqual([false, false])
  })
  it('is a no-op when already in that state and refuses unknown tasks', () => {
    const before = sample()
    const same = setTaskDone('tw', 't2', true)(before)
    expect(same.ok && same.config).toBe(before)
    expect(refusal(setTaskDone('tw', 'nope', true))).toMatch(/not found/)
  })
})

describe('removeTask', () => {
  it('removes only that task and frees its id', () => {
    const config = run(removeTask('tw', 't1'))
    expect(items(config)).toEqual([{ id: 't2', text: 'Second', done: true }])
    expect(items(run(addTask('tw', 't1', 'again'), config)).at(-1)!.id).toBe('t1')
  })
  it('refuses unknown tasks and shares untouched branches', () => {
    expect(refusal(removeTask('tw', 'nope'))).toMatch(/not found/)
    const before = sample()
    const after = run(removeTask('tw', 't1'), before)
    const widgets = after.sections[0].widgets
    expect(widgets[1]).toBe(before.sections[0].widgets[1]) // notes widget untouched
  })
})
