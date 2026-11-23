import type { CSSProperties } from 'react'
import { DEFAULT_THEME } from '../../domain/workspace/constants'
import type { Theme } from '../../domain/workspace/types'

const HEX = /^#[0-9a-fA-F]{6}$/

/** Allowlisted font stacks. The theme stores only the key; the stack text lives here, in code. */
export const FONT_STACKS: Record<string, string> = {
  system: "system-ui, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'Cascadia Code', Consolas, monospace",
}

export const FONT_LABELS: Record<string, string> = { system: 'System sans-serif', serif: 'Serif', mono: 'Monospace' }

type Variables = CSSProperties & Record<`--${string}`, string>

/**
 * CSS custom properties for the workspace theme. Every value is re-checked here, so only a hex
 * colour, an allowlisted font key or an integer size can reach the stylesheet; anything else falls
 * back to the default. Static classes reference these variables; no class names come from JSON.
 */
export function themeVariables(theme: Theme): CSSProperties {
  const colour = (value: unknown, fallback: string) => (typeof value === 'string' && HEX.test(value) ? value : fallback)
  const stack = Object.hasOwn(FONT_STACKS, theme.fontFamily) ? FONT_STACKS[theme.fontFamily] : FONT_STACKS.system
  const size = Number.isInteger(theme.fontSizePx) && theme.fontSizePx >= 12 && theme.fontSizePx <= 20 ? theme.fontSizePx : DEFAULT_THEME.fontSizePx
  const variables: Variables = {
    '--fs-primary': colour(theme.primary, DEFAULT_THEME.primary),
    '--fs-background': colour(theme.background, DEFAULT_THEME.background),
    '--fs-surface': colour(theme.surface, DEFAULT_THEME.surface),
    '--fs-text': colour(theme.text, DEFAULT_THEME.text),
    '--fs-font': stack,
    '--fs-size': `${size}px`,
  }
  return variables
}
