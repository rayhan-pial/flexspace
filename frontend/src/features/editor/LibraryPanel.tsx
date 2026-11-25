import { useEffect, useId, useRef, useState } from 'react'
import { KNOWN_WIDGET_TYPES, MAX_WIDGETS } from '../../domain/workspace/constants'
import { newId } from '../../domain/workspace/ids'
import { addWidget } from '../../domain/workspace/lifecycle'
import type { KnownWidgetType } from '../../domain/workspace/types'
import Button from '../../shared/ui/Button'
import { LIBRARY_CATEGORIES, widgetPresentation, widgetTypeLabel } from '../workspace/registry'
import type { LibraryCategory } from '../workspace/registry'
import { useEditorStore } from './editorStore'
import { useInspectorView } from './inspectorView'
import { resolveSelection } from './selection'

type Filter = 'All' | LibraryCategory

/**
 * Add known widget types to the draft. They go into the selected section (or the section of the
 * selected widget), otherwise the last visible section. The new widget is selected so its
 * properties show. Searching and filtering are local view state only: they never touch the draft.
 */
export default function LibraryPanel() {
  const draft = useEditorStore((s) => s.draftConfig)
  const selection = useEditorStore((s) => s.selection)
  const apply = useEditorStore((s) => s.apply)
  const select = useEditorStore((s) => s.select)
  const { setView } = useInspectorView()
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<{ label: string; section: string } | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const searchId = useId()
  const notice = useRef<HTMLDivElement>(null)
  // The list can be scrolled far from the confirmation, so bring it into view after each add.
  useEffect(() => {
    if (added) notice.current?.scrollIntoView?.({ block: 'nearest' })
  }, [added])

  if (!draft) return null
  if (draft.sections.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ui-muted">Add a section in the Outline tab first, then add components to it here.</p>
        <Button onClick={() => setView('outline')}>Open outline</Button>
      </div>
    )
  }

  const resolved = resolveSelection(draft, selection)
  const target =
    resolved?.kind === 'section' ? resolved.section : resolved?.kind === 'widget' ? resolved.section : (draft.sections.filter((s) => !s.hidden).at(-1) ?? draft.sections[draft.sections.length - 1])

  const widgetCount = draft.sections.reduce((sum, section) => sum + section.widgets.length, 0)
  const full = widgetCount >= MAX_WIDGETS
  const needle = query.trim().toLowerCase()
  const visible = KNOWN_WIDGET_TYPES.filter((type) => {
    const { description, category } = widgetPresentation(type)
    if (filter !== 'All' && category !== filter) return false
    return needle === '' || `${widgetTypeLabel(type)} ${description} ${category}`.toLowerCase().includes(needle)
  })

  function add(type: KnownWidgetType) {
    const widgetId = newId('widget')
    const outcome = apply(addWidget(target.id, type, widgetId))
    if (outcome.status === 'rejected') {
      setError(outcome.error)
      setAdded(null)
      return
    }
    setError(null)
    setAdded({ label: widgetTypeLabel(type), section: target.title || 'Untitled section' })
    select({ kind: 'widget', id: widgetId })
  }

  return (
    <div className="space-y-4">
      <p className="rounded-ui-control bg-ui-subtle px-3 py-2 text-sm text-ui-text">
        Adding to <strong className="font-semibold">{target.title || 'Untitled section'}</strong>
        <span className="mt-0.5 block text-xs text-ui-muted">Select another section or widget first to add somewhere else.</span>
      </p>

      {added && !error && (
        <div ref={notice} role="status" className="space-y-2 rounded-ui-control bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <p>Added {added.label} to {added.section} and selected it.</p>
          <Button onClick={() => setView('properties')}>Edit properties</Button>
        </div>
      )}

      <div>
        <label htmlFor={searchId} className="block text-sm font-medium text-ui-text">Search components</label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try tasks or calendar"
          className="ui-focus mt-1 block w-full rounded-ui-control border border-ui-control bg-ui-surface px-3 py-1.5 text-sm text-ui-text placeholder:text-ui-muted focus:border-ui-primary [@media(pointer:coarse)]:min-h-11"
        />
      </div>

      <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
        {(['All', ...LIBRARY_CATEGORIES] as Filter[]).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
            className={`ui-focus rounded-full px-3 py-1 text-xs font-medium ring-1 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 ${
              filter === name ? 'bg-ui-selected text-ui-selected-text ring-ui-primary' : 'bg-ui-surface text-ui-text ring-ui-control hover:bg-ui-subtle'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {full && (
        <p role="status" className="rounded-ui-control bg-amber-50 px-3 py-2 text-sm text-ui-warning ring-1 ring-amber-200">
          This workspace has reached the limit of {MAX_WIDGETS} widgets. Remove one to add another.
        </p>
      )}

      <p role="status" className="text-xs text-ui-muted">
        {visible.length === 0 ? 'No components match.' : `${visible.length} of ${KNOWN_WIDGET_TYPES.length} components shown.`}
      </p>

      {visible.length === 0 ? (
        <Button
          onClick={() => {
            setQuery('')
            setFilter('All')
          }}
        >
          Clear search and filter
        </Button>
      ) : (
        <ul aria-label="Component library" className="grid gap-2">
          {visible.map((type) => {
            const { description, category, Icon } = widgetPresentation(type)
            return (
              <li key={type} className="flex items-start gap-3 rounded-ui-control bg-ui-surface p-3 ring-1 ring-ui-border">
                <span aria-hidden="true" className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-ui-control bg-ui-selected text-ui-selected-text">
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ui-text">{widgetTypeLabel(type)}</p>
                  <p className="text-xs text-ui-muted">{description}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ui-muted">{category}</p>
                  <Button className="mt-2" disabled={full} onClick={() => add(type)}>
                    Add {widgetTypeLabel(type)}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </div>
  )
}
