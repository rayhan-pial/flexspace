import type { CSSProperties } from 'react'

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * Turn a widget's appearance into inline style. Only the three allowlisted keys are read and each
 * value is re-checked here, so nothing outside a hex colour or a 12-24 px size can ever reach CSS.
 */
export function safeAppearanceStyle(appearance: Record<string, unknown>): CSSProperties {
  const style: CSSProperties = {}
  const { background, text, fontSizePx } = appearance
  if (typeof background === 'string' && HEX.test(background)) style.backgroundColor = background
  if (typeof text === 'string' && HEX.test(text)) style.color = text
  if (typeof fontSizePx === 'number' && Number.isInteger(fontSizePx) && fontSizePx >= 12 && fontSizePx <= 24) {
    style.fontSize = `${fontSizePx}px`
  }
  return style
}
