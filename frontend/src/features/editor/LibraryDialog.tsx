import { useId, useMemo, useRef, useState } from 'react'
import { KNOWN_WIDGET_TYPES, MAX_WIDGETS } from '../../domain/workspace/constants'
import { newId } from '../../domain/workspace/ids'
import { addWidget } from '../../domain/workspace/lifecycle'
import type { KnownWidgetType, Section } from '../../domain/workspace/types'
import Button from '../../shared/ui/Button'
import Dialog from '../../shared/ui/Dialog'
import { LIBRARY_CATEGORIES, widgetPresentation, widgetTypeLabel } from '../workspace/registry'
import type { LibraryCategory } from '../workspace/registry'
import { useEditorStore } from './editorStore'
import { defaultDestination, destinationOptions, kindLabel } from './libraryDestinations'

type Filter = 'All' | LibraryCategory

export interface AddedWidget {
  widgetId: string
  typeLabel: string
  sectionTitle: string
  kind: Section['kind']
}

/**
 * Add known widget types to the draft, into a destination the user can see and change. One click on
 * Add adds exactly one instance to the section shown above the list, then the dialog closes and the
 * editor reveals, selects and describes the new card. If the chosen section disappears or is hidden
 * while the dialog is open, Add is disabled until another is picked: it never retargets silently.
 * Searching, filtering and choosing a destination are presentation only; they never touch the draft.
 */
export default function LibraryDialog({ onClose, onAdded, onOpenOutline }: { onClose: () => void; onAdded: (added: AddedWidget) => void; onOpenOutline: () => void }) {
  const draft = useEditorStore((s) => s.draftConfig)
  const selection = useEditorStore((s) => s.selection)
  const apply = useEditorStore((s) => s.apply)
  const select = useEditorStore((s) => s.select)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const searchId = useId()
  const destinationId = useId()
  const noteId = useId()
  const destinationRef = useRef<HTMLSelectElement>(null)
  const addedOnce = useRef(false)

  const options = useMemo(() => (draft ? destinationOptions(draft) : []), [draft])
  const automatic = draft ? defaultDestination(draft, selection) : null
  const chosen = chosenId ? options.find((option) => option.section.id === chosenId)?.section ?? null : null
  const lost = chosenId !== null && chosen === null // picked on purpose, then hidden or deleted
  const destination = chosenId !== null ? chosen : automatic

  const widgetCount = draft ? draft.sections.reduce((sum, section) => sum + section.widgets.length, 0) : 0
  const full = widgetCount >= MAX_WIDGETS
  const noSections = !draft || draft.sections.length === 0
  const noneVisible = !noSections && options.length === 0

  const blocker = noSections
    ? 'There are no sections yet. Add a section in the Outline first.'
    : noneVisible
      ? 'Every section is hidden. Show a section or add a new one in the Outline.'
      : lost
        ? 'The section you chose is no longer available. Pick another section.'
        : full
          ? `This workspace has reached the limit of ${MAX_WIDGETS} widgets. Remove one to add another.`
          : null

  const needle = query.trim().toLowerCase()
  const visible = KNOWN_WIDGET_TYPES.filter((type) => {
    const { description, category } = widgetPresentation(type)
    if (filter !== 'All' && category !== filter) return false
    return needle === '' || `${widgetTypeLabel(type)} ${description} ${category}`.toLowerCase().includes(needle)
  })

  function add(type: KnownWidgetType) {
    if (!destination || blocker || addedOnce.current) return
    const widgetId = newId('widget')
    const outcome = apply(addWidget(destination.id, type, widgetId))
    if (outcome.status === 'rejected') {
      setError(outcome.error)
      return
    }
    addedOnce.current = true
    setError(null)
    select({ kind: 'widget', id: widgetId })
    onAdded({ widgetId, typeLabel: widgetTypeLabel(type), sectionTitle: destination.title.trim() || 'Untitled section', kind: destination.kind })
  }

  const destinationText = destination
    ? `Adding to ${destination.title.trim() || 'Untitled section'} (${kindLabel(destination)}). ${destination.kind === 'grid' ? 'It takes the first free spot in the grid.' : 'It goes to the end of the stack.'}`
    : 'Choose a section to add to.'

  return (
    <Dialog title="Add a component" description="Pick where it goes, then add it. It is added to your draft; nothing is saved until you press Save." onClose={onClose} size="lg" initialFocusRef={destinationRef}>
      {noSections || noneVisible ? (
        <div className="space-y-3">
          <p role="status" className="rounded-ui-control bg-amber-50 px-3 py-2 text-sm text-ui-warning ring-1 ring-amber-200">{blocker}</p>
          <Button variant="primary" onClick={onOpenOutline}>Open outline</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor={destinationId} className="block text-sm font-medium text-ui-text">Add to section</label>
            <select
              id={destinationId}
              ref={destinationRef}
              value={destination?.id ?? ''}
              aria-describedby={noteId}
              onChange={(event) => {
                setChosenId(event.target.value || null)
                setError(null)
              }}
              className="ui-focus mt-1 block w-full rounded-ui-control border border-ui-control bg-ui-surface px-3 py-1.5 text-sm text-ui-text focus:border-ui-primary [@media(pointer:coarse)]:min-h-11"
            >
              {destination === null && <option value="">Choose a section…</option>}
              {options.map(({ section, label }) => (
                <option key={section.id} value={section.id}>{label}</option>
              ))}
            </select>
            <p id={noteId} className="mt-1 rounded-ui-control bg-ui-subtle px-3 py-2 text-sm text-ui-text">{lost ? 'The section you chose is no longer available. Pick another section.' : destinationText}</p>
          </div>

          {blocker && (
            <p role="status" className="rounded-ui-control bg-amber-50 px-3 py-2 text-sm text-ui-warning ring-1 ring-amber-200">
              {blocker}
              {full && ' '}
              {full && <button type="button" className="ui-focus font-medium underline" onClick={onOpenOutline}>Open outline</button>}
            </p>
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

          <p role="status" className="text-xs text-ui-muted">
            {visible.length === 0 ? 'No components match.' : `${visible.length} of ${KNOWN_WIDGET_TYPES.length} components shown.`}
          </p>

          {visible.length === 0 ? (
            <Button onClick={() => { setQuery(''); setFilter('All') }}>Clear search and filter</Button>
          ) : (
            <ul aria-label="Component library" className="grid gap-2 sm:grid-cols-2">
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
                      <Button className="mt-2" reason={blocker} onClick={() => add(type)}>
                        Add {widgetTypeLabel(type)}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {error && (
            <p role="alert" className="rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">{error}</p>
          )}
        </div>
      )}
    </Dialog>
  )
}
