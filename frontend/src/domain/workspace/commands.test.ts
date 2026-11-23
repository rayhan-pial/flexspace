import { describe, expect, it } from 'vitest'
import { setTheme, setWorkspaceTitle, updateWidget } from './commands'
import { deepEqual, deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import type { WorkspaceConfig } from './types'

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Sample',
    sections: [
      {
        id: 's1', kind: 'grid', title: 'Main',
        widgets: [
          { id: 'w1', type: 'notes', title: 'Notes', props: { body: 'hello' } },
          { id: 'w2', type: 'welcome', props: { greeting: 'Hi' }, appearance: { background: '#ffffff' } },
        ],
        layout: [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }, { i: 'w2', x: 6, y: 0, w: 6, h: 3 }],
      },
      { id: 's2', kind: 'stack', title: 'Other', widgets: [{ id: 'w3', type: 'notes', props: { body: 'third' } }] },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return deepFreeze(parsed.config)
}

describe('deepEqual / deepFreeze', () => {
  it('compares JSON structurally, ignoring key order', () => {
    expect(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
    expect(deepEqual([], {})).toBe(false)
    expect(deepEqual(null, {})).toBe(false)
  })
  it('freezes deeply', () => {
    const value = deepFreeze({ a: [{ b: 1 }] })
    expect(() => { (value.a[0] as { b: number }).b = 2 }).toThrow(TypeError)
  })
})

describe('commands', () => {
  it('never mutate their input (a frozen draft would throw)', () => {
    const config = sample()
    expect(() => setWorkspaceTitle('Changed')(config)).not.toThrow()
    expect(() => setTheme({ primary: '#112233' })(config)).not.toThrow()
    expect(() => updateWidget('w1', { title: 'T', props: { body: 'x' }, appearance: { text: '#000000' } })(config)).not.toThrow()
    expect(config.title).toBe('Sample')
  })

  it('setWorkspaceTitle returns the same object for a no-op', () => {
    const config = sample()
    const same = setWorkspaceTitle('Sample')(config)
    expect(same.ok && same.config).toBe(config)
  })

  it('setTheme merges and detects no-ops', () => {
    const config = sample()
    const changed = setTheme({ primary: '#112233' })(config)
    expect(changed.ok && changed.config.theme).toEqual({ ...config.theme, primary: '#112233' })
    const same = setTheme({ primary: config.theme.primary })(config)
    expect(same.ok && same.config).toBe(config)
  })

  it('updateWidget replaces only the affected branch (structural sharing)', () => {
    const config = sample()
    const result = updateWidget('w1', { props: { body: 'edited' } })(config)
    if (!result.ok) throw new Error(result.error)
    const next = result.config
    expect(next.sections[0].widgets[0].props).toEqual({ body: 'edited' })
    expect(next.sections[0].widgets[1]).toBe(config.sections[0].widgets[1]) // sibling untouched
    expect(next.sections[1]).toBe(config.sections[1]) // other section untouched
    expect(next.sections[0].layout).toBe(config.sections[0].layout)
    expect(next.theme).toBe(config.theme)
  })

  it('updateWidget finds widgets by ID in any section, not by index', () => {
    const result = updateWidget('w3', { title: 'Renamed' })(sample())
    expect(result.ok && result.config.sections[1].widgets[0].title).toBe('Renamed')
  })

  it('updateWidget merges props and appearance, and removes keys set to undefined', () => {
    const config = sample()
    const result = updateWidget('w2', { props: { subtitle: 'Sub' }, appearance: { background: undefined, text: '#111111' } })(config)
    if (!result.ok) throw new Error(result.error)
    const widget = result.config.sections[0].widgets[1]
    expect(widget.props).toEqual({ greeting: 'Hi', subtitle: 'Sub' })
    expect(widget.appearance).toEqual({ text: '#111111' })
  })

  it('updateWidget is a no-op when nothing differs and fails for an unknown widget', () => {
    const config = sample()
    const same = updateWidget('w1', { title: 'Notes', props: { body: 'hello' } })(config)
    expect(same.ok && same.config).toBe(config)
    expect(updateWidget('missing', { title: 'x' })(config)).toEqual({ ok: false, error: 'Widget missing was not found.' })
  })
})
