import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME } from '../../domain/workspace/constants'
import type { Theme } from '../../domain/workspace/types'
import { FONT_STACKS, themeVariables } from './theme'

const theme: Theme = { ...DEFAULT_THEME, primary: '#112233', background: '#aabbcc', surface: '#ffffff', text: '#000000', fontFamily: 'serif', fontSizePx: 18 }

describe('themeVariables', () => {
  it('maps a valid theme to custom properties, with the font stack coming from code', () => {
    expect(themeVariables(theme)).toEqual({
      '--fs-primary': '#112233', '--fs-background': '#aabbcc', '--fs-surface': '#ffffff', '--fs-text': '#000000',
      '--fs-font': FONT_STACKS.serif, '--fs-size': '18px',
    })
  })
  it('never lets anything but a hex colour, an allowlisted font or an in-range integer reach CSS', () => {
    const hostile = {
      ...theme, primary: 'red; background: url(//evil)', text: '#12', surface: 'var(--x)',
      fontFamily: 'constructor', fontSizePx: 9999,
    } as unknown as Theme
    expect(themeVariables(hostile)).toEqual({
      '--fs-primary': DEFAULT_THEME.primary, '--fs-background': '#aabbcc', '--fs-surface': DEFAULT_THEME.surface, '--fs-text': DEFAULT_THEME.text,
      '--fs-font': FONT_STACKS.system, '--fs-size': '16px',
    })
    expect(themeVariables({ ...theme, fontSizePx: 14.5 })['--fs-size' as keyof ReturnType<typeof themeVariables>]).toBe('16px')
  })
})
