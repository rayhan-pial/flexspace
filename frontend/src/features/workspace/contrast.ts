const HEX = /^#[0-9a-fA-F]{6}$/

function channel(value: number): number {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21), or null if either is not a valid colour. */
export function contrastRatio(a: string, b: string): number | null {
  if (!HEX.test(a) || !HEX.test(b)) return null
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export interface ContrastCheck {
  label: string
  ratio: number
  /** Minimum the pair should reach: 4.5 for text, 3 for large text and graphics. */
  required: number
  ok: boolean
}

/** Advisory checks for the colour pairs a workspace actually draws. They never block a change. */
export function themeContrastChecks(theme: { primary: string; background: string; surface: string; text: string }): ContrastCheck[] {
  const pairs: Array<[string, string, string, number]> = [
    ['Text on page background', theme.text, theme.background, 4.5],
    ['Text on cards', theme.text, theme.surface, 4.5],
    ['Primary color on cards', theme.primary, theme.surface, 3],
  ]
  const checks: ContrastCheck[] = []
  for (const [label, foreground, background, required] of pairs) {
    const ratio = contrastRatio(foreground, background)
    if (ratio !== null) checks.push({ label, ratio, required, ok: ratio >= required })
  }
  return checks
}
