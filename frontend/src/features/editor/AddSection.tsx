import { useState } from 'react'
import type { SectionKind } from '../../domain/workspace/types'
import { newId } from '../../domain/workspace/ids'
import { addSection } from '../../domain/workspace/lifecycle'
import { useEditorStore } from './editorStore'

const button =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'

/** Adds a section of a chosen layout kind and selects it. */
export default function AddSection() {
  const apply = useEditorStore((s) => s.apply)
  const select = useEditorStore((s) => s.select)
  const [error, setError] = useState<string | null>(null)

  function add(kind: SectionKind) {
    const sectionId = newId('section')
    const outcome = apply(addSection(kind, sectionId, 'New section'))
    if (outcome.status === 'rejected') {
      setError(outcome.error)
      return
    }
    setError(null)
    select({ kind: 'section', id: sectionId })
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Add section</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => add('grid')} className={button}>
          Dashboard grid
        </button>
        <button type="button" onClick={() => add('stack')} className={button}>
          Stack
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">
          {error}
        </p>
      )}
    </div>
  )
}
