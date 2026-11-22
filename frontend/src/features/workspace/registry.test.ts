import { describe, expect, it } from 'vitest'
import { deepEqual } from '../../domain/workspace/immutable'
import { getWidgetDefinition, isKnownWidgetType, widgetTypeLabel } from './registry'

describe('widget registry', () => {
  it('resolves the notes widget with its schema-owned minimum size', () => {
    const notes = getWidgetDefinition('notes')!
    expect(notes).toBeDefined()
    expect(notes).toMatchObject({ type: 'notes', label: 'Notes', minSize: [3, 3] })
    expect(notes.fields).toEqual([{ key: 'body', label: 'Note', kind: 'textarea', maxLength: 10000 }])
  })

  it('its default props satisfy its own parser', () => {
    const notes = getWidgetDefinition('notes')!
    expect(deepEqual(notes.parseProps(notes.defaultProps), notes.defaultProps)).toBe(true)
  })

  it('parses valid props and rejects invalid ones with null', () => {
    const notes = getWidgetDefinition('notes')!
    expect(notes.parseProps({ body: 'hello' })).toEqual({ body: 'hello' })
    expect(notes.parseProps({})).toEqual({ body: '' })
    expect(notes.parseProps({ body: 5 })).toBeNull()
    expect(notes.parseProps({ body: 'x', extra: true })).toBeNull()
    expect(notes.parseProps({ body: 'x'.repeat(10_001) })).toBeNull()
    expect(notes.parseProps(null)).toBeNull()
    expect(notes.parseProps([])).toBeNull()
  })

  it('has no entry for schema-known types whose renderers ship later, or for unknown types', () => {
    for (const type of ['welcome', 'tasks', 'gallery', 'analytics', 'calendar', 'kanban']) {
      expect(getWidgetDefinition(type)).toBeUndefined()
    }
  })

  it('treats Object.prototype names as plain unknown types', () => {
    for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(getWidgetDefinition(type)).toBeUndefined()
      expect(isKnownWidgetType(type)).toBe(false)
    }
  })

  it('distinguishes known-but-pending types from unknown ones', () => {
    expect(isKnownWidgetType('tasks')).toBe(true)
    expect(isKnownWidgetType('notes')).toBe(true)
    expect(isKnownWidgetType('kanban')).toBe(false)
  })

  it('labels types for display', () => {
    expect(widgetTypeLabel('notes')).toBe('Notes')
    expect(widgetTypeLabel('welcome')).toBe('Welcome')
  })
})
