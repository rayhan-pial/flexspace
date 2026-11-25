import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from './ids'

afterEach(() => vi.unstubAllGlobals())

describe('newId', () => {
  it('matches the id pattern and is practically unique', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId('widget')))
    expect(ids.size).toBe(500)
    for (const id of ids) expect(id).toMatch(/^widget-[0-9a-f]{12}$/)
  })

  it('works where crypto.randomUUID is missing, as on plain HTTP at a LAN address', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    expect(newId('section')).toMatch(/^section-[0-9a-f]{12}$/)
  })
})
