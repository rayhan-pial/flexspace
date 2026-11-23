import { DEFAULT_DISPLAY_MONTH } from './constants'
import type { KnownPropsByType, KnownWidgetType } from './types'

/**
 * Props a newly added widget starts with. These are data only (no ids are needed because the
 * lists start empty), so every known type can be added to a draft before its renderer exists.
 * Each value passes the type's props parser.
 */
export const DEFAULT_WIDGET_PROPS: { [T in KnownWidgetType]: KnownPropsByType[T] } = {
  welcome: { greeting: 'Welcome', subtitle: '' },
  tasks: { items: [] },
  notes: { body: '' },
  gallery: { items: [] },
  analytics: { metrics: [] },
  calendar: { displayMonth: DEFAULT_DISPLAY_MONTH, events: [] },
}
