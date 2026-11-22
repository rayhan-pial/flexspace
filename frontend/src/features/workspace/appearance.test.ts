import { describe, expect, it } from 'vitest'
import { safeAppearanceStyle } from './appearance'

describe('safeAppearanceStyle', () => {
  it('maps the three allowlisted keys to CSS', () => {
    expect(safeAppearanceStyle({ background: '#eef2ff', text: '#1E1B4B', fontSizePx: 14 })).toEqual({
      backgroundColor: '#eef2ff', color: '#1E1B4B', fontSize: '14px',
    })
  })

  it('returns nothing for an empty appearance', () => {
    expect(safeAppearanceStyle({})).toEqual({})
  })

  it.each([
    'url(javascript:alert(1))', 'red', '#fff', '#12345', '#1234567', 'expression(alert(1))',
    '#ffffff; position: fixed', '#ffffff\n', 5, null, {}, ['#ffffff'],
  ])('ignores a non-hex colour: %j', (value) => {
    expect(safeAppearanceStyle({ background: value, text: value })).toEqual({})
  })

  it.each([11, 25, 14.5, '14', '14px; color: red', NaN, Infinity, null])('ignores an invalid font size: %j', (value) => {
    expect(safeAppearanceStyle({ fontSizePx: value })).toEqual({})
  })

  it('never passes through any other key', () => {
    const style = safeAppearanceStyle({ background: '#ffffff', width: '100vw', position: 'fixed', zIndex: 99, '--x': '1' })
    expect(Object.keys(style)).toEqual(['backgroundColor'])
  })
})
