import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateConfig } from './migrate'
import { parseWorkspaceConfig } from './parse'

const FIXTURES = join(__dirname, '../../../../contracts/fixtures')
const load = (kind: string) =>
  readdirSync(join(FIXTURES, kind))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(FIXTURES, kind, f), 'utf-8'))] as const)

describe('shared valid fixtures', () => {
  it.each(load('valid'))('%s', (_name, fixture) => {
    const before = structuredClone(fixture.input)
    const result = parseWorkspaceConfig(fixture.input)
    expect(result.ok, result.ok ? '' : result.message).toBe(true)
    if (!result.ok) return
    expect(result.config).toEqual(fixture.expected ?? fixture.input)
    expect(fixture.input).toEqual(before) // input is never mutated
    const again = parseWorkspaceConfig(result.config)
    expect(again.ok && again.config).toEqual(result.config) // idempotent
  })
})

describe('shared invalid fixtures', () => {
  it('is populated', () => {
    expect(load('valid').length).toBeGreaterThanOrEqual(4)
    expect(load('invalid').length).toBeGreaterThanOrEqual(40)
  })
  it.each(load('invalid'))('%s', (_name, fixture) => {
    const result = parseWorkspaceConfig(fixture.input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe(fixture.error)
  })
})

const base = (extra: object = {}) => ({ schemaVersion: 1, title: 't', ...extra })
const stackWith = (widgets: object[], id = 's1') => ({ id, kind: 'stack', widgets })
const notes = (i: number, body = '') => ({ id: `w${i}`, type: 'notes', props: { body } })
const accepts = (doc: unknown) => expect(parseWorkspaceConfig(doc).ok).toBe(true)
const rejects = (doc: unknown) => expect(parseWorkspaceConfig(doc).ok).toBe(false)

describe('limits', () => {
  it('sections', () => {
    const sections = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, kind: 'stack' }))
    accepts(base({ sections: sections(12) }))
    rejects(base({ sections: sections(13) }))
  })
  it('total widgets', () => {
    const doc = (n: number) =>
      base({
        sections: Array.from({ length: Math.ceil(n / 10) }, (_, s) =>
          stackWith(
            Array.from({ length: Math.min(10, n - s * 10) }, (_, k) => notes(s * 10 + k)),
            `s${s}`,
          ),
        ),
      })
    accepts(doc(50))
    rejects(doc(51))
  })
  it('repeatable lists', () => {
    const tasks = (n: number) =>
      base({
        sections: [
          stackWith([{ id: 'w', type: 'tasks', props: { items: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, text: 'x' })) } }]),
        ],
      })
    accepts(tasks(100))
    rejects(tasks(101))
  })
  it('text limits count code points, not UTF-16 units', () => {
    const emoji = '\u{1F600}'
    accepts(base({ title: emoji.repeat(120) }))
    rejects(base({ title: emoji.repeat(121) }))
    accepts(base({ sections: [stackWith([notes(1, 'a'.repeat(10000))])] }))
    rejects(base({ sections: [stackWith([notes(1, 'a'.repeat(10001))])] }))
    const task = (n: number) =>
      base({ sections: [stackWith([{ id: 'w', type: 'tasks', props: { items: [{ id: 't', text: 'a'.repeat(n) }] } }])] })
    accepts(task(2000))
    rejects(task(2001))
  })
  it('non-finite metric values', () => {
    const metric = (value: number) =>
      base({ sections: [stackWith([{ id: 'w', type: 'analytics', props: { metrics: [{ id: 'm', label: 'l', value }] } }])] })
    accepts(metric(0))
    accepts(metric(-3.25))
    rejects(metric(Infinity))
    rejects(metric(NaN))
  })
})

describe('migration dispatcher', () => {
  it('v1 is an identity that returns a copy', () => {
    const doc = base()
    const out = migrateConfig(doc)
    expect(out).toEqual(doc)
    expect(out).not.toBe(doc)
  })
  it.each([null, [], 'x', 3])('rejects non-object %j', (bad) => rejects(bad))
  it('blocks a future version rather than resetting it', () => {
    const result = parseWorkspaceConfig(base({ schemaVersion: 2 }))
    expect(result).toMatchObject({ ok: false, code: 'unsupported_schema_version' })
  })
})
