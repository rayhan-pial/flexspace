import { DEFAULT_MIN_SIZE, KNOWN_WIDGET_TYPES, MIN_SIZE } from '../../domain/workspace/constants'
import { parseKnownProps } from '../../domain/workspace/parse'
import { analyticsWidget } from '../../widgets/analytics'
import { calendarWidget } from '../../widgets/calendar'
import { galleryWidget } from '../../widgets/gallery'
import { notesWidget } from '../../widgets/notes'
import { tasksWidget } from '../../widgets/tasks'
import { welcomeWidget } from '../../widgets/welcome'
import type { WidgetDefinition } from '../../widgets/types'

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
