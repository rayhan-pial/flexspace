import { describe, expect, it } from 'vitest'
import { KNOWN_WIDGET_TYPES } from '../../domain/workspace/constants'
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

  it('has an entry for every schema-known type, whose default props satisfy its own parser, and none for unknown types', () => {
    for (const type of KNOWN_WIDGET_TYPES) {
      const definition = getWidgetDefinition(type)!
      expect(definition, type).toBeDefined()
      expect(definition.type).toBe(type)
      expect(deepEqual(definition.parseProps(definition.defaultProps), definition.defaultProps), type).toBe(true)
      expect(definition.minSize[0]).toBeGreaterThanOrEqual(1)
    }
    expect(getWidgetDefinition('kanban')).toBeUndefined()
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
