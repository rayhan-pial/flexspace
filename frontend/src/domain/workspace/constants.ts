// Mirrors backend/app/schemas/config.py. Shared fixtures in /contracts keep both in agreement.

export const SCHEMA_VERSION = 1

export const MAX_SECTIONS = 12
export const MAX_WIDGETS = 50
export const MAX_LIST_ITEMS = 100
export const MAX_LABEL = 120
export const MAX_TEXT = 2000
export const MAX_BODY = 10000
export const GRID_COLUMNS = 12
export const MAX_ROW_H = 24
export const DEFAULT_DISPLAY_MONTH = '2026-01'

export const FONT_FAMILIES = ['system', 'serif', 'mono'] as const
export const NAV_PLACEMENTS = ['top', 'left', 'right'] as const
export const SECTION_KINDS = ['grid', 'stack'] as const
export const ICONS = [
  'home', 'layout-dashboard', 'check-square', 'notebook', 'image', 'bar-chart',
  'calendar', 'settings', 'star', 'folder', 'users', 'mail',
] as const
export const ASSET_KEYS = ['aurora', 'workspace', 'mountain', 'studio', 'forest', 'city'] as const
/** A gallery item may show a picture the user uploaded: `upload:<image id>` (the id is a lowercase UUID). */
export const UPLOAD_KEY = /^upload:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export const KNOWN_WIDGET_TYPES = ['welcome', 'tasks', 'notes', 'gallery', 'analytics', 'calendar'] as const

/** Per-type minimum grid size. Owned by the domain (it validates layouts); the widget registry re-exposes it. */
export const MIN_SIZE: Record<string, readonly [w: number, h: number]> = {
  welcome: [3, 2], tasks: [3, 4], notes: [3, 3],
  gallery: [4, 4], analytics: [4, 3], calendar: [4, 5],
}
export const DEFAULT_MIN_SIZE = [1, 2] as const

export const DEFAULT_THEME = {
  primary: '#6366f1',
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#0f172a',
  fontFamily: 'system',
  fontSizePx: 16,
} as const
