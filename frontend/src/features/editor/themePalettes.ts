import type { Theme } from '../../domain/workspace/types'

export type PaletteColors = Pick<Theme, 'primary' | 'background' | 'surface' | 'text'>

/** Starting points. Applying one just sets the four existing theme colors; nothing else is stored. */
export const SUGGESTED_PALETTES: ReadonlyArray<{ name: string; colors: PaletteColors }> = [
  { name: 'Indigo', colors: { primary: '#6366f1', background: '#f8fafc', surface: '#ffffff', text: '#0f172a' } },
  { name: 'Forest', colors: { primary: '#15803d', background: '#f0fdf4', surface: '#ffffff', text: '#14281d' } },
  { name: 'Sunset', colors: { primary: '#c2410c', background: '#fff7ed', surface: '#ffffff', text: '#2a1a12' } },
  { name: 'Midnight', colors: { primary: '#818cf8', background: '#0f172a', surface: '#1e293b', text: '#e2e8f0' } },
]
