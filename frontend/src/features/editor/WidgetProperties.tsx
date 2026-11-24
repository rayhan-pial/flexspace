import { useState } from 'react'
import { updateWidget } from '../../domain/workspace/commands'
import type { Command, WidgetPatch } from '../../domain/workspace/commands'
import { MAX_LABEL } from '../../domain/workspace/constants'
import type { Widget } from '../../domain/workspace/types'
import { CheckboxField, ColorField, IntegerField, NumberField, TextAreaField, TextField } from '../../shared/ui/fields'
import Group from '../../shared/ui/Group'
import type { DispatchResult, FieldDescriptor } from '../../widgets/types'
import { getWidgetDefinition, isKnownWidgetType } from '../workspace/registry'
import { useEditorStore } from './editorStore'

/**
 * Editable properties of the selected widget, generated from allowlisted descriptors: the common
 * title and appearance fields, plus the `fields` the widget's registry entry declares. Unknown
 * widget types have opaque data, so they get no editable fields. Every change is a domain command,
 * so it updates the draft live, is validated, and is reversed by Cancel.
 */
export default function WidgetProperties({ widget }: { widget: Widget }) {
  const apply = useEditorStore((s) => s.apply)
  const [error, setError] = useState<string | null>(null)
  if (!isKnownWidgetType(widget.type)) return null

  function change(patch: WidgetPatch) {
    const outcome = apply(updateWidget(widget.id, patch))
    setError(outcome.status === 'rejected' ? outcome.error : null)
  }

  const definition = getWidgetDefinition(widget.type)
  const props = definition ? definition.parseProps(widget.props) : null
  const Inspector = definition?.Inspector
  const dispatch = (command: Command): DispatchResult => {
    const outcome = apply(command)
    return outcome.status === 'rejected' ? { ok: false, error: outcome.error } : { ok: true }
  }
  const { background, text, fontSizePx } = widget.appearance as { background?: string; text?: string; fontSizePx?: number }

  function field(descriptor: FieldDescriptor) {
    const value = props?.[descriptor.key]
    const set = (next: unknown) => change({ props: { [descriptor.key]: next } })
    switch (descriptor.kind) {
      case 'text':
        return <TextField key={descriptor.key} label={descriptor.label} value={String(value ?? '')} maxLength={descriptor.maxLength} onChange={set} />
      case 'textarea':
        return <TextAreaField key={descriptor.key} label={descriptor.label} value={String(value ?? '')} maxLength={descriptor.maxLength} onChange={set} />
      case 'number':
        return <NumberField key={descriptor.key} label={descriptor.label} value={typeof value === 'number' ? value : 0} onChange={set} />
      case 'boolean':
        return <CheckboxField key={descriptor.key} label={descriptor.label} checked={value === true} onChange={set} />
      case 'color':
        return <ColorField key={descriptor.key} label={descriptor.label} value={typeof value === 'string' ? value : undefined} onChange={set} />
    }
  }

  return (
    <>
      <Group title="Content">
        <TextField label="Title" value={widget.title} maxLength={MAX_LABEL} onChange={(title) => change({ title })} />

        {props && definition && definition.fields.length > 0 && (
          <div className="space-y-4">{definition.fields.map(field)}</div>
        )}

        {props && Inspector && <Inspector widgetId={widget.id} props={props} dispatch={dispatch} />}
      </Group>

      <Group title="Appearance">
        <ColorField label="Background" value={background} onChange={(v) => change({ appearance: { background: v } })} onReset={() => change({ appearance: { background: undefined } })} />
        <ColorField label="Text color" value={text} onChange={(v) => change({ appearance: { text: v } })} onReset={() => change({ appearance: { text: undefined } })} />
        <IntegerField label="Font size (px)" value={fontSizePx} min={12} max={24} onChange={(v) => change({ appearance: { fontSizePx: v } })} onReset={() => change({ appearance: { fontSizePx: undefined } })} />
      </Group>

      {error && <p role="alert" className="mt-3 rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">{error}</p>}
    </>
  )
}
