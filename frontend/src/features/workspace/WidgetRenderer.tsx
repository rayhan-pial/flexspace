import type { ReactNode } from 'react'
import { memo, useCallback, useMemo } from 'react'
import { updateWidget } from '../../domain/workspace/commands'
import type { Command } from '../../domain/workspace/commands'
import type { Widget } from '../../domain/workspace/types'
import type { DispatchResult } from '../../widgets/types'
import { useEditorStore } from '../editor/editorStore'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import GridHandle from './GridHandle'
import { InvalidWidgetBody, UnsupportedWidget } from './WidgetPlaceholders'
import WidgetShell from './WidgetShell'
import { getWidgetDefinition, widgetTypeLabel } from './registry'

/**
 * Resolves a widget's `type` through the code-owned registry and renders it inside the common
 * shell. Widget components get parsed props and a callback; the callback becomes a validated
 * domain command here, so widgets never touch the store themselves.
 */
function WidgetRenderer({ widget, inGrid = false, sortHandle }: { widget: Widget; inGrid?: boolean; sortHandle?: ReactNode }) {
  const mode = useEffectiveMode()
  const selected = useEditorStore((s) => s.selection?.kind === 'widget' && s.selection.id === widget.id)
  const apply = useEditorStore((s) => s.apply)
  const select = useEditorStore((s) => s.select)

  const definition = getWidgetDefinition(widget.type)
  const props = useMemo(() => (definition ? definition.parseProps(widget.props) : null), [definition, widget.props])

  const widgetId = widget.id
  const onChangeProps = useCallback(
    (patch: Record<string, unknown>) => {
      apply(updateWidget(widgetId, { props: patch }))
    },
    [apply, widgetId],
  )
  const dispatch = useCallback(
    (command: Command): DispatchResult => {
      const outcome = apply(command)
      return outcome.status === 'rejected' ? { ok: false, error: outcome.error } : { ok: true }
    },
    [apply],
  )
  const onSelect = useCallback(() => select({ kind: 'widget', id: widgetId }), [select, widgetId])

  // No registry entry (an unknown type, which is the only way to get here): bounded placeholder, no appearance (its data is opaque), data untouched.
  if (!definition) return <UnsupportedWidget widgetId={widget.id} type={widget.type} handle={mode === 'edit' ? (sortHandle ?? (inGrid ? <GridHandle widgetId={widget.id} title="unsupported widget" /> : undefined)) : undefined} />

  const label = widgetTypeLabel(widget.type)
  const title = widget.title || label
  const shell = (body: React.ReactNode) => (
    <WidgetShell widgetId={widget.id} title={title} mode={mode} selected={selected} appearance={widget.appearance} onSelect={onSelect}
      handle={sortHandle ?? (inGrid ? <GridHandle widgetId={widget.id} title={title} /> : undefined)}>
      {body}
    </WidgetShell>
  )

  if (!props) return shell(<InvalidWidgetBody />)
  const { Component } = definition
  return shell(<Component widgetId={widget.id} title={title} props={props} mode={mode} onChangeProps={onChangeProps} dispatch={dispatch} />)
}

export default memo(WidgetRenderer)
