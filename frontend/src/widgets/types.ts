import type { ComponentType } from 'react'
import type { Command } from '../domain/workspace/commands'
import type { KnownWidgetType } from '../domain/workspace/types'

export type WidgetMode = 'edit' | 'preview'

/** An allowlisted, editable property of a widget (the inspector is generated from these in FS-014). */
export interface FieldDescriptor {
  key: string
  label: string
  kind: 'text' | 'textarea' | 'number' | 'boolean' | 'color'
  maxLength?: number
}

/**
 * What a widget renderer receives: already-parsed props and explicit callbacks. Renderers never
 * read the editor store, and they never receive raw configuration objects.
 */
export type DispatchResult = { ok: true } | { ok: false; error: string }

export interface WidgetRenderProps<P extends object> {
  /** Id of this widget, for addressing it in domain commands. */
  widgetId: string
  title: string
  props: P
  mode: WidgetMode
  /** Request a props change; the host turns it into a validated domain command. */
  onChangeProps: (patch: Partial<P>) => void
  /** Run a typed domain command (task add/check/...); the host validates it and reports a refusal. */
  dispatch: (command: Command) => DispatchResult
}

/** What a widget's inspector section receives (list editing for gallery and analytics). */
export interface WidgetInspectorProps<P extends object> {
  widgetId: string
  props: P
  dispatch: (command: Command) => DispatchResult
}

/** A code-owned widget module. Configuration only ever selects one by its `type` key. */
export interface WidgetDefinition<P extends object> {
  type: KnownWidgetType
  label: string
  defaultProps: P
  fields: readonly FieldDescriptor[]
  Component: ComponentType<WidgetRenderProps<P>>
  /** Extra inspector controls for content that the flat `fields` cannot describe (lists). */
  Inspector?: ComponentType<WidgetInspectorProps<P>>
}
