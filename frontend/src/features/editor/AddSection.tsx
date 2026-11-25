import { useState } from 'react'
import type { SectionKind } from '../../domain/workspace/types'
import { newId } from '../../domain/workspace/ids'
import { addSection } from '../../domain/workspace/lifecycle'
import { useEditorStore } from './editorStore'

const button =
  'rounded-ui-control border border-ui-control px-3 py-1.5 text-sm font-medium text-ui-text hover:bg-ui-subtle ui-focus'

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
    <div className="mt-4 border-t border-ui-border pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ui-muted">Add section</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => add('grid')} className={button}>
          Dashboard grid
        </button>
        <button type="button" onClick={() => add('stack')} className={button}>
          Stack
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </div>
  )
}
