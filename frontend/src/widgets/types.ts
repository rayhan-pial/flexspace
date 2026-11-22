import type { ComponentType } from 'react'
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
export interface WidgetRenderProps<P extends object> {
  title: string
  props: P
  mode: WidgetMode
  /** Request a props change; the host turns it into a validated domain command. */
  onChangeProps: (patch: Partial<P>) => void
}

/** A code-owned widget module. Configuration only ever selects one by its `type` key. */
export interface WidgetDefinition<P extends object> {
  type: KnownWidgetType
  label: string
  defaultProps: P
  fields: readonly FieldDescriptor[]
  Component: ComponentType<WidgetRenderProps<P>>
}
