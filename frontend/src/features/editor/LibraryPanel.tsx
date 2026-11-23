import { useState } from 'react'
import { KNOWN_WIDGET_TYPES } from '../../domain/workspace/constants'
import { newId } from '../../domain/workspace/ids'
import { addWidget } from '../../domain/workspace/lifecycle'
import { widgetTypeLabel } from '../workspace/registry'
import { useEditorStore } from './editorStore'
import { resolveSelection } from './selection'

const button =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'

/**
 * Add known widget types to the draft. They go into the selected section (or the section of the
 * selected widget), otherwise the last section. The new widget is selected so its properties show.
 */
export default function LibraryPanel() {
  const draft = useEditorStore((s) => s.draftConfig)
  const selection = useEditorStore((s) => s.selection)
  const apply = useEditorStore((s) => s.apply)
  const select = useEditorStore((s) => s.select)
  const [error, setError] = useState<string | null>(null)

  if (!draft) return null
  if (draft.sections.length === 0) {
    return <p className="text-sm text-slate-500">Add a section in the Outline tab first, then add components to it here.</p>
  }

  const resolved = resolveSelection(draft, selection)
  const target =
    resolved?.kind === 'section' ? resolved.section : resolved?.kind === 'widget' ? resolved.section : (draft.sections.filter((s) => !s.hidden).at(-1) ?? draft.sections[draft.sections.length - 1])

  function add(type: string) {
    const widgetId = newId('widget')
    const outcome = apply(addWidget(target.id, type, widgetId))
    if (outcome.status === 'rejected') {
      setError(outcome.error)
      return
    }
    setError(null)
    select({ kind: 'widget', id: widgetId })
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        Adding to <strong className="font-semibold text-slate-900">{target.title || 'Untitled section'}</strong>
      </p>
      <ul aria-label="Component library" className="grid gap-2">
        {KNOWN_WIDGET_TYPES.map((type) => (
          <li key={type} className="grid">
            <button type="button" onClick={() => add(type)} className={button}>
              Add {widgetTypeLabel(type)}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">
          {error}
        </p>
      )}
    </div>
  )
}
