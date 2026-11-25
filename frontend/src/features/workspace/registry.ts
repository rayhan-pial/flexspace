import { DEFAULT_MIN_SIZE, KNOWN_WIDGET_TYPES, MIN_SIZE } from '../../domain/workspace/constants'
import { parseKnownProps } from '../../domain/workspace/parse'
import { analyticsWidget } from '../../widgets/analytics'
import { calendarWidget } from '../../widgets/calendar'
import { galleryWidget } from '../../widgets/gallery'
import { notesWidget } from '../../widgets/notes'
import { tasksWidget } from '../../widgets/tasks'
import { welcomeWidget } from '../../widgets/welcome'
import type { WidgetDefinition } from '../../widgets/types'
import type { ComponentType } from 'react'
import type { KnownWidgetType } from '../../domain/workspace/types'
import {
  AnalyticsWidgetIcon, CalendarWidgetIcon, GalleryWidgetIcon, NotesWidgetIcon, TasksWidgetIcon, WelcomeWidgetIcon,
} from '../../shared/ui/icons'

/*
 * Code-owned widget registry. Configuration selects an entry by its `type` string and never
 * supplies code. A type that is known to the schema but has no entry yet (its renderer ships in a
 * later task) is reported by `isKnownWidgetType` and rendered as a "coming soon" card; any other
 * type is an unknown widget and renders the safe placeholder.
 */

export interface RegisteredWidget extends WidgetDefinition<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  minSize: readonly [w: number, h: number]
  /** Runtime props parser; `null` means the stored props are not valid for this type. */
  parseProps: (raw: unknown) => Record<string, unknown> | null
}

function register(definition: WidgetDefinition<any>): RegisteredWidget { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    ...definition,
    minSize: MIN_SIZE[definition.type] ?? DEFAULT_MIN_SIZE,
    parseProps: (raw) => {
      const result = parseKnownProps(definition.type, raw)
      return result.ok ? result.props : null
    },
  }
}

// A Map avoids prototype lookups: a widget whose type is "constructor" or "__proto__" is simply unknown.
const registry = new Map<string, RegisteredWidget>(
  [welcomeWidget, tasksWidget, notesWidget, galleryWidget, analyticsWidget, calendarWidget].map((definition) => [definition.type, register(definition)]),
)

export const getWidgetDefinition = (type: string): RegisteredWidget | undefined => registry.get(type)

export const isKnownWidgetType = (type: string): boolean => (KNOWN_WIDGET_TYPES as readonly string[]).includes(type)

/** Human label for a known type, used by the "coming soon" card. */
export const widgetTypeLabel = (type: string): string => registry.get(type)?.label ?? type.charAt(0).toUpperCase() + type.slice(1)

export const LIBRARY_CATEGORIES = ['Content', 'Productivity', 'Data'] as const
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number]

export interface WidgetPresentation {
  description: string
  category: LibraryCategory
  Icon: ComponentType
}

/**
 * How the component library describes each known widget. Presentation only: what a widget is,
 * adds and stores still comes from its definition and the domain commands.
 */
const PRESENTATION: Record<KnownWidgetType, WidgetPresentation> = {
  welcome: { description: 'A greeting and a short subtitle to open a section.', category: 'Content', Icon: WelcomeWidgetIcon },
  tasks: { description: 'A checklist you can add to, tick off and reorder.', category: 'Productivity', Icon: TasksWidgetIcon },
  notes: { description: 'A free-form note with a character counter.', category: 'Content', Icon: NotesWidgetIcon },
  gallery: { description: 'A set of images with captions from the built-in picture set.', category: 'Content', Icon: GalleryWidgetIcon },
  analytics: { description: 'Key figures with their values shown as bars.', category: 'Data', Icon: AnalyticsWidgetIcon },
  calendar: { description: 'A month view with an agenda of dated entries.', category: 'Productivity', Icon: CalendarWidgetIcon },
}

export const widgetPresentation = (type: KnownWidgetType): WidgetPresentation => PRESENTATION[type]
/** Same lookup for a type that might be unknown: undefined instead of a crash. */
export const findWidgetPresentation = (type: string): WidgetPresentation | undefined => (isKnownWidgetType(type) ? PRESENTATION[type as KnownWidgetType] : undefined)
