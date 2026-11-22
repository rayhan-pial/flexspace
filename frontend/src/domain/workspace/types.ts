import type {
  ASSET_KEYS, FONT_FAMILIES, ICONS, KNOWN_WIDGET_TYPES, NAV_PLACEMENTS, SECTION_KINDS,
} from './constants'

export type FontFamily = (typeof FONT_FAMILIES)[number]
export type NavPlacement = (typeof NAV_PLACEMENTS)[number]
export type SectionKind = (typeof SECTION_KINDS)[number]
export type IconName = (typeof ICONS)[number]
export type AssetKey = (typeof ASSET_KEYS)[number]
export type KnownWidgetType = (typeof KNOWN_WIDGET_TYPES)[number]

export interface Theme {
  primary: string
  background: string
  surface: string
  text: string
  fontFamily: FontFamily
  fontSizePx: number
}

export interface NavItem {
  id: string
  label: string
  targetSectionId: string | null
  icon: IconName
}

export interface Navigation {
  placement: NavPlacement
  primaryItems: NavItem[]
  secondaryItems: NavItem[]
}

export interface Appearance {
  background?: string
  text?: string
  fontSizePx?: number
}

export interface GridRect { i: string; x: number; y: number; w: number; h: number }

// Persisted props of the known widget types.
export interface WelcomeProps { greeting: string; subtitle: string }
export interface TaskItem { id: string; text: string; done: boolean }
export interface TasksProps { items: TaskItem[] }
export interface NotesProps { body: string }
export interface GalleryItem { id: string; assetKey: AssetKey; alt: string; caption: string }
export interface GalleryProps { items: GalleryItem[] }
export interface Metric { id: string; label: string; value: number }
export interface AnalyticsProps { metrics: Metric[] }
export interface CalendarEvent { id: string; date: string; title: string }
export interface CalendarProps { displayMonth: string; events: CalendarEvent[] }

export interface KnownPropsByType {
  welcome: WelcomeProps
  tasks: TasksProps
  notes: NotesProps
  gallery: GalleryProps
  analytics: AnalyticsProps
  calendar: CalendarProps
}

/**
 * A persisted widget. `type` is any string: known types carry validated props
 * (see KnownPropsByType); unknown types keep opaque JSON objects untouched.
 */
export interface Widget {
  id: string
  type: string
  title: string
  hidden: boolean
  appearance: Record<string, unknown>
  props: Record<string, unknown>
}

export interface Section {
  id: string
  kind: SectionKind
  title: string
  hidden: boolean
  widgets: Widget[]
  /** Present only on grid sections. */
  layout?: GridRect[]
}

export interface WorkspaceConfig {
  schemaVersion: 1
  title: string
  theme: Theme
  navigation: Navigation
  sections: Section[]
}

export type ConfigErrorCode = 'invalid_config' | 'unsupported_schema_version'

export type ParseResult =
  | { ok: true; config: WorkspaceConfig }
  | { ok: false; code: ConfigErrorCode; message: string }
