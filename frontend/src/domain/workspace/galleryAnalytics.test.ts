import { describe, expect, it } from 'vitest'
import { addMetric, removeMetric, updateMetric } from './analytics'
import type { Command } from './commands'
import { ASSET_KEYS, MAX_LABEL, MAX_LIST_ITEMS, MAX_TEXT } from './constants'
import { addGalleryItem, removeGalleryItem, updateGalleryItem } from './gallery'
import { deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import type { GalleryItem, Metric, WorkspaceConfig } from './types'

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'G',
    sections: [
      {
        id: 's1', kind: 'stack', title: 'Main',
        widgets: [
          { id: 'gal', type: 'gallery', props: { items: [{ id: 'i1', assetKey: 'aurora', alt: 'A', caption: 'C' }, { id: 'i2', assetKey: 'city', alt: '', caption: '' }] } },
          { id: 'ana', type: 'analytics', props: { metrics: [{ id: 'm1', label: 'Visits', value: 10 }, { id: 'm2', label: 'Sales', value: 2.5 }] } },
          { id: 'note', type: 'notes' },
          { id: 'emptyg', type: 'gallery' },
          { id: 'emptya', type: 'analytics' },
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
  expect(parsed.ok).toBe(true) // what the store would require
  if (parsed.ok) expect(parsed.config).toEqual(result.config)
  return result.config
}
const refusal = (command: Command, from = sample()) => {
  const result = command(from)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}
const widget = (config: WorkspaceConfig, id: string) => config.sections[0].widgets.find((w) => w.id === id)!
const images = (config: WorkspaceConfig, id = 'gal') => widget(config, id).props.items as GalleryItem[]
const metrics = (config: WorkspaceConfig, id = 'ana') => widget(config, id).props.metrics as Metric[]

describe('gallery commands', () => {
  it('adds an image with a bundled key, a stable id and empty alt/caption', () => {
    const config = run(addGalleryItem('gal', 'img-new', 'forest'))
    expect(images(config).at(-1)).toEqual({ id: 'img-new', assetKey: 'forest', alt: '', caption: '' })
    expect(images(run(addGalleryItem('emptyg', 'x', 'city')), 'emptyg')).toHaveLength(1)
    for (const key of ASSET_KEYS) expect(run(addGalleryItem('gal', `k-${key}`, key))).toBeDefined()
  })
  it('rejects keys outside the bundled allowlist, including prototype names', () => {
    const keys = ['', 'unknown', 'https://example.com/a.png', '../secret', 'constructor', '__proto__', 'upload:', 'upload:../x', 'upload:123E4567-E89B-42D3-A456-426614174000', 'UPLOAD:123e4567-e89b-42d3-a456-426614174000']
    for (const key of keys) {
      expect(refusal(addGalleryItem('gal', 'x', key))).toMatch(/not an image you can use/)
      expect(refusal(updateGalleryItem('gal', 'i1', { assetKey: key }))).toMatch(/not an image you can use/)
    }
  })
  it('accepts an uploaded image key (upload:<lowercase uuid>) when adding and updating', () => {
    const key = 'upload:123e4567-e89b-42d3-a456-426614174000'
    expect(images(run(addGalleryItem('gal', 'x', key))).at(-1)).toEqual({ id: 'x', assetKey: key, alt: '', caption: '' })
    expect(images(run(updateGalleryItem('gal', 'i1', { assetKey: key })))[0].assetKey).toBe(key)
  })
  it('updates picture, alt and caption by id, preserving id and order', () => {
    const config = run(updateGalleryItem('gal', 'i1', { assetKey: 'studio', alt: 'New alt', caption: 'New caption' }))
    expect(images(config)).toEqual([{ id: 'i1', assetKey: 'studio', alt: 'New alt', caption: 'New caption' }, images(sample())[1]])
    expect(images(run(updateGalleryItem('gal', 'i2', { alt: '' })))[1].alt).toBe('') // an empty alt is allowed
  })
  it('enforces text limits, the item limit, id uniqueness, widget type and no-ops', () => {
    expect(refusal(updateGalleryItem('gal', 'i1', { alt: 'a'.repeat(MAX_TEXT + 1) }))).toMatch(/Alt text/)
    expect(refusal(updateGalleryItem('gal', 'i1', { caption: 'a'.repeat(MAX_TEXT + 1) }))).toMatch(/Caption/)
    for (const used of ['i1', 'gal', 's1', 'm1']) expect(refusal(addGalleryItem('gal', used, 'city'))).toMatch(/already in use/)
    expect(refusal(addGalleryItem('note', 'x', 'city'))).toMatch(/not a gallery/)
    expect(refusal(addGalleryItem('ana', 'x', 'city'))).toMatch(/not a gallery/)
    expect(refusal(updateGalleryItem('gal', 'nope', { alt: 'x' }))).toMatch(/not found/)
    let config = sample()
    for (let n = images(config).length; n < MAX_LIST_ITEMS; n += 1) config = run(addGalleryItem('gal', `f${n}`, 'city'), config)
    expect(refusal(addGalleryItem('gal', 'over', 'city'), config)).toMatch(/at most 100/)
    const before = sample()
    const same = updateGalleryItem('gal', 'i1', { alt: 'A', caption: 'C', assetKey: 'aurora' })(before)
    expect(same.ok && same.config).toBe(before)
  })
  it('removes by id and frees the id', () => {
    const config = run(removeGalleryItem('gal', 'i1'))
    expect(images(config).map((i) => i.id)).toEqual(['i2'])
    expect(images(run(addGalleryItem('gal', 'i1', 'city'), config)).at(-1)!.id).toBe('i1')
    expect(refusal(removeGalleryItem('gal', 'nope'))).toMatch(/not found/)
  })
})

describe('analytics commands', () => {
  it('adds a metric with a stable id and a trimmed label', () => {
    const config = run(addMetric('ana', 'metric-new', '  Revenue  ', 1234.5))
    expect(metrics(config).at(-1)).toEqual({ id: 'metric-new', label: 'Revenue', value: 1234.5 })
    expect(metrics(run(addMetric('emptya', 'z', 'Zero', 0)), 'emptya')).toEqual([{ id: 'z', label: 'Zero', value: 0 }])
    expect(metrics(run(addMetric('ana', 'neg', 'Loss', -4))).at(-1)!.value).toBe(-4) // negative numbers are valid data
  })
  it('rejects non-finite values and empty or over-long labels', () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      expect(refusal(addMetric('ana', 'x', 'L', value))).toMatch(/finite number/)
      expect(refusal(updateMetric('ana', 'm1', { value }))).toMatch(/finite number/)
    }
    expect(refusal(addMetric('ana', 'x', '  ', 1))).toMatch(/needs a label/)
    expect(refusal(updateMetric('ana', 'm1', { label: '' }))).toMatch(/needs a label/)
    expect(refusal(addMetric('ana', 'x', 'a'.repeat(MAX_LABEL + 1), 1))).toMatch(/at most/)
    expect(refusal(addMetric('ana', 'x', 'L', '5' as unknown as number))).toMatch(/finite number/)
  })
  it('updates label and value by id, preserving ids and order', () => {
    const config = run(updateMetric('ana', 'm2', { label: ' Revenue ', value: 99 }))
    expect(metrics(config)).toEqual([metrics(sample())[0], { id: 'm2', label: 'Revenue', value: 99 }])
    expect(metrics(run(updateMetric('ana', 'm1', { value: 0 })))[0].value).toBe(0)
  })
  it('enforces ids, the item limit, widget type, unknown metrics and no-ops', () => {
    for (const used of ['m1', 'ana', 's1', 'i1']) expect(refusal(addMetric('ana', used, 'L', 1))).toMatch(/already in use/)
    expect(refusal(addMetric('gal', 'x', 'L', 1))).toMatch(/not an analytics widget/)
    expect(refusal(updateMetric('ana', 'nope', { value: 1 }))).toMatch(/not found/)
    let config = sample()
    for (let n = metrics(config).length; n < MAX_LIST_ITEMS; n += 1) config = run(addMetric('ana', `f${n}`, 'L', n), config)
    expect(refusal(addMetric('ana', 'over', 'L', 1), config)).toMatch(/at most 100/)
    const before = sample()
    const same = updateMetric('ana', 'm1', { label: 'Visits', value: 10 })(before)
    expect(same.ok && same.config).toBe(before)
  })
  it('removes by id, sharing untouched branches', () => {
    const before = sample()
    const config = run(removeMetric('ana', 'm1'), before)
    expect(metrics(config).map((m) => m.id)).toEqual(['m2'])
    expect(widget(config, 'gal')).toBe(widget(before, 'gal'))
    expect(refusal(removeMetric('ana', 'nope'))).toMatch(/not found/)
  })
})
