import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deepFreeze } from './immutable'
import { instantiateTemplate } from './instantiate'
import { parseWorkspaceConfig } from './parse'
import type { WorkspaceConfig } from './types'

const FIXTURES = join(__dirname, '../../../../contracts/fixtures/valid')
const KEYS = ['productivity', 'analytics', 'creative'] as const

function template(key: string): WorkspaceConfig {
  const raw = JSON.parse(readFileSync(join(FIXTURES, `system-template-${key}.json`), 'utf-8')).input
  const parsed = parseWorkspaceConfig(raw)
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.config
}

/** Every id in the document: sections, widgets, nav items and every list entry. */
function allIds(config: WorkspaceConfig): string[] {
  const ids: string[] = []
  for (const item of [...config.navigation.primaryItems, ...config.navigation.secondaryItems]) ids.push(item.id)
  for (const section of config.sections) {
    ids.push(section.id)
    for (const widget of section.widgets) {
      ids.push(widget.id)
      for (const key of ['items', 'metrics', 'events']) {
        const entries = widget.props[key]
        if (Array.isArray(entries)) for (const entry of entries) ids.push((entry as { id: string }).id)
      }
    }
  }
  return ids
}

/** The config with every id blanked, to compare shapes and content independent of ids. */
function withoutIds(config: WorkspaceConfig): unknown {
  return JSON.parse(
    JSON.stringify(config, (key, value) => (key === 'id' || key === 'i' || key === 'targetSectionId' ? undefined : value)),
  )
}

describe.each(KEYS)('instantiating the %s template', (key) => {
  const original = template(key)

  it('gives every entity a brand-new id: none of the template ids survives', () => {
    const next = instantiateTemplate(original)
    const before = new Set(allIds(original))
    const after = allIds(next)
    expect(after).toHaveLength(allIds(original).length)
    expect(after.filter((id) => before.has(id))).toEqual([])
    expect(new Set(after).size).toBe(after.length) // and they are unique within the document
  })

  it('produces a document the parser accepts unchanged (ids match the schema pattern and limits)', () => {
    const next = instantiateTemplate(original)
    const parsed = parseWorkspaceConfig(next)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.config).toEqual(next)
    for (const id of allIds(next)) expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  })

  it('keeps everything except ids exactly as designed: content, theme, geometry and order', () => {
    const next = instantiateTemplate(original)
    expect(withoutIds(next)).toEqual(withoutIds(original))
    expect(next.theme).toEqual(original.theme)
    expect(next.navigation.placement).toBe(original.navigation.placement)
    for (const [n, section] of next.sections.entries()) {
      expect(section.widgets.map((w) => w.type)).toEqual(original.sections[n].widgets.map((w) => w.type))
      expect(section.layout?.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual(original.sections[n].layout?.map(({ x, y, w, h }) => ({ x, y, w, h })))
    }
  })

  it('remaps every reference: navigation targets and layout rectangles point at the new ids', () => {
    const next = instantiateTemplate(original)
    const sectionIds = new Set(next.sections.map((s) => s.id))
    const nav = [...next.navigation.primaryItems, ...next.navigation.secondaryItems]
    expect(nav.length).toBeGreaterThan(0)
    for (const item of nav) expect(sectionIds.has(item.targetSectionId!)).toBe(true)
    // the same pairing as in the template: nav item n goes to the n-th target section
    const oldNav = [...original.navigation.primaryItems, ...original.navigation.secondaryItems]
    nav.forEach((item, n) => {
      const oldIndex = original.sections.findIndex((s) => s.id === oldNav[n].targetSectionId)
      expect(next.sections[oldIndex].id).toBe(item.targetSectionId)
    })
    for (const section of next.sections) {
      if (section.kind !== 'grid') continue
      expect(section.layout!.map((r) => r.i).sort()).toEqual(section.widgets.map((w) => w.id).sort())
      expect(section.layout!.map((r) => r.i)).toEqual(section.widgets.map((w) => w.id)) // same order as the widgets
    }
  })

  it('does not modify the template it was given, and two instantiations never share an id', () => {
    const frozen = deepFreeze(structuredClone(original))
    const first = instantiateTemplate(frozen)
    const second = instantiateTemplate(frozen)
    expect(frozen).toEqual(original)
    const firstIds = new Set(allIds(first))
    expect(allIds(second).filter((id) => firstIds.has(id))).toEqual([])
  })
})

describe('instantiateTemplate details', () => {
  it('is deterministic with an injected generator, and retries a generator that repeats itself', () => {
    const original = template('productivity')
    const counter = () => {
      let n = 0
      return (prefix: string) => `${prefix}-${n++}`
    }
    const a = instantiateTemplate(original, counter())
    const b = instantiateTemplate(original, counter())
    expect(a).toEqual(b)
    expect(a.sections[0].id).toBe('section-0')
    // A generator that returns the same id twice in a row must not produce a duplicate.
    const stuck = ((values: string[]) => (_prefix: string) => values.shift() ?? `x-${Math.random().toString(16).slice(2)}`)(['same', 'same', 'same', 'other'])
    const tiny = parseWorkspaceConfig({ schemaVersion: 1, title: 'T', sections: [{ id: 's', kind: 'stack', title: 'S', widgets: [{ id: 'w', type: 'notes' }] }] })
    if (!tiny.ok) throw new Error(tiny.message)
    const out = instantiateTemplate(tiny.config, stuck)
    expect(new Set(allIds(out)).size).toBe(allIds(out).length)
  })

  it('leaves the props of unknown widget types untouched (their ids cannot be recognised)', () => {
    const parsed = parseWorkspaceConfig({
      schemaVersion: 1, title: 'Unknown',
      sections: [{ id: 's', kind: 'stack', title: 'S', widgets: [{ id: 'w', type: 'kanban', props: { cards: [{ id: 'card-1' }], flag: true } }] }],
    })
    if (!parsed.ok) throw new Error(parsed.message)
    const next = instantiateTemplate(parsed.config)
    expect(next.sections[0].widgets[0].props).toEqual({ cards: [{ id: 'card-1' }], flag: true })
    expect(next.sections[0].widgets[0].id).not.toBe('w')
  })

  it('keeps unlinked navigation items unlinked and nulls nothing else', () => {
    const parsed = parseWorkspaceConfig({
      schemaVersion: 1, title: 'Nav',
      navigation: { placement: 'top', primaryItems: [{ id: 'n1', label: 'Nowhere', targetSectionId: null }], secondaryItems: [] },
      sections: [],
    })
    if (!parsed.ok) throw new Error(parsed.message)
    const next = instantiateTemplate(parsed.config)
    expect(next.navigation.primaryItems[0]).toMatchObject({ label: 'Nowhere', targetSectionId: null })
    expect(next.navigation.primaryItems[0].id).not.toBe('n1')
  })

  it('also works on an empty workspace', () => {
    const parsed = parseWorkspaceConfig({ schemaVersion: 1, title: 'Empty' })
    if (!parsed.ok) throw new Error(parsed.message)
    expect(instantiateTemplate(parsed.config)).toEqual(parsed.config)
  })
})
