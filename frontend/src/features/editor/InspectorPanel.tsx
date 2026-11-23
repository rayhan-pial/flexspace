import { isKnownWidgetType, widgetTypeLabel } from '../workspace/registry'
import { useEditorStore } from './editorStore'
import NavItemProperties from './NavItemProperties'
import WidgetProperties from './WidgetProperties'
import { SectionActions, WidgetActions } from './LifecycleActions'
import { resolveSelection } from './selection'

/**
 * Properties slot. It renders only what the current selection *resolves to* in the draft, so a
 * removed target can never leave a stale inspector behind. Editable fields live in the *Properties components.
 */
export default function InspectorPanel() {
  const draft = useEditorStore((s) => s.draftConfig)
  const selection = useEditorStore((s) => s.selection)
  const target = resolveSelection(draft, selection)

  if (!target) {
    return <p className="text-sm text-slate-500">Select a component on the canvas or in the outline to see its properties.</p>
  }

  const rows: Array<[string, string]> = []
  let heading = ''
  if (target.kind === 'widget') {
    const { widget, section } = target
    heading = widget.title || (isKnownWidgetType(widget.type) ? widgetTypeLabel(widget.type) : 'Unsupported widget')
    rows.push(['Type', isKnownWidgetType(widget.type) ? widgetTypeLabel(widget.type) : `Unsupported (${widget.type})`])
    rows.push(['Section', section.title || 'Untitled section'])
    rows.push(['Visibility', widget.hidden ? 'Hidden' : 'Visible'])
  } else if (target.kind === 'section') {
    heading = target.section.title || 'Untitled section'
    rows.push(['Layout', target.section.kind === 'grid' ? 'Dashboard grid' : 'Stack'])
    rows.push(['Widgets', String(target.section.widgets.length)])
    rows.push(['Visibility', target.section.hidden ? 'Hidden' : 'Visible'])
  } else {
    heading = target.item.label
    const section = draft?.sections.find((s) => s.id === target.item.targetSectionId)
    rows.push(['Goes to', section ? section.title || 'Untitled section' : 'Nothing'])
  }

  return (
    <div aria-live="polite">
      <h3 className="text-sm font-semibold text-slate-900">{heading}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([name, value]) => (
          <div key={name} className="flex justify-between gap-3">
            <dt className="text-slate-500">{name}</dt>
            <dd className="text-right text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      {target.kind === 'widget' && <WidgetProperties widget={target.widget} />}
      {target.kind === 'navItem' && draft && <NavItemProperties item={target.item} config={draft} />}
      {target.kind === 'widget' && <WidgetActions widget={target.widget} section={target.section} sections={draft?.sections ?? []} />}
      {target.kind === 'section' && <SectionActions section={target.section} />}

    </div>
  )
}
