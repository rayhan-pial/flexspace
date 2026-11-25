import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { formatDate, monthOf, monthTitle, monthWeeks, shiftMonth } from '../../domain/workspace/dates'
import type { CalendarEvent, CalendarProps } from '../../domain/workspace/types'
import SortHandle from '../../features/sorting/SortHandle'
import SortableSection from '../../features/sorting/SortableSection'
import { useOptionalSortContext } from '../../features/sorting/sortContext'
import { EVENT_ITEM_TYPE, listContainerId } from '../../features/sorting/workspaceAdapter'
import type { WidgetRenderProps } from '../types'

const WEEKDAYS = [['Sun', 'Sunday'], ['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday']] as const

function AgendaEntry({ event, handle }: { event: CalendarEvent; handle?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-sm">
      {handle}
      <time dateTime={event.date} className="w-24 shrink-0 text-xs tabular-nums opacity-70">{formatDate(event.date)}</time>
      <span className="min-w-0 break-words">{event.title}</span>
    </div>
  )
}

const navButton =
  'ui-focus rounded p-1 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 inline-flex items-center justify-center'

/**
 * A month grid plus the agenda. The grid is always chronological; the agenda lists the saved
 * events in their stored array order. Browsing to another month is transient state kept here: it
 * never writes to the draft (so it cannot dirty the workspace) and it resets whenever the saved
 * display month changes. Events and the display month are edited from the inspector.
 */
export default function CalendarWidget({ widgetId, title, props, mode }: WidgetRenderProps<CalendarProps>) {
  const hasSorting = useOptionalSortContext() !== null
  const [browse, setBrowse] = useState<{ from: string; month: string } | null>(null)
  const shown = browse && browse.from === props.displayMonth ? browse.month : props.displayMonth
  const previous = shiftMonth(shown, -1)
  const next = shiftMonth(shown, 1)

  const go = (month: string | null) => month && setBrowse({ from: props.displayMonth, month })

  const eventsByDate = new Map<string, string[]>()
  for (const event of props.events) {
    if (monthOf(event.date) !== shown) continue
    eventsByDate.set(event.date, [...(eventsByDate.get(event.date) ?? []), event.title])
  }

  return (
    <div className="@container fs-scroll flex h-full min-h-0 flex-col gap-3 overflow-x-hidden overflow-y-auto">
      <div>
        <div className="flex items-center justify-between gap-2">
          <button type="button" disabled={previous === null} onClick={() => go(previous)} aria-label="Previous month" className={navButton}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <p aria-live="polite" className="text-sm font-semibold">{monthTitle(shown)}</p>
          <button type="button" disabled={next === null} onClick={() => go(next)} aria-label="Next month" className={navButton}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
        {shown !== props.displayMonth && (
          <button type="button" onClick={() => setBrowse(null)} className="ui-focus mt-1 text-xs underline">
            Back to {monthTitle(props.displayMonth)}
          </button>
        )}

        <table aria-label={`${title || 'Calendar'}, ${monthTitle(shown)}`} className="mt-2 w-full table-fixed border-collapse text-center text-xs">
          <thead>
            <tr>
              {WEEKDAYS.map(([short, full]) => (
                <th key={short} scope="col" className="pb-1 text-[10px] font-medium opacity-70 @[15rem]:text-xs"><abbr title={full} className="no-underline">
                    <span aria-hidden="true" className="@[15rem]:hidden">{short.slice(0, 2)}</span>
                    <span className="hidden @[15rem]:inline">{short}</span>
                  </abbr></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthWeeks(shown).map((week, row) => (
              <tr key={row}>
                {week.map((cell, column) => {
                  if (!cell) return <td key={column} />
                  const events = eventsByDate.get(cell.date)
                  return (
                    <td key={column} title={events?.join(', ')} className="p-0 @[15rem]:p-0.5">
                      <span className={`relative mx-auto flex size-5 items-center text-[10px] @[15rem]:size-7 @[15rem]:text-xs justify-center rounded-full tabular-nums ${events ? 'bg-[var(--fs-primary,#6366f1)] font-semibold text-white' : ''}`}>
                        {cell.day}
                        {events && <span className="sr-only">, {events.length === 1 ? '1 event' : `${events.length} events`}</span>}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fs-rule border-t pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Agenda</p>
        {mode === 'edit' && hasSorting ? (
          // The agenda is the editable, reorderable group: it follows the saved array, not the dates.
          // Entries can be reordered here but never moved to another calendar.
          <SortableSection
            containerId={listContainerId('calendar', widgetId)}
            itemType={EVENT_ITEM_TYPE}
            items={props.events.map((event) => event.id)}
            orientation="vertical"
            label={`${title || 'Calendar'} agenda`}
            emptyLabel="No events yet. Select this widget and add some in Properties."
            className="mt-1 gap-0.5"
            renderItem={(id, { handleRef }) => {
              const event = props.events.find((entry) => entry.id === id)
              return event ? <AgendaEntry event={event} handle={<SortHandle handleRef={handleRef} label={`Reorder event ${event.title}`} />} /> : null
            }}
          />
        ) : props.events.length === 0 ? (
          <p className="mt-1 text-sm opacity-70">{mode === 'edit' ? 'No events yet. Select this widget and add some in Properties.' : 'No events yet.'}</p>
        ) : (
          <ul aria-label={`${title || 'Calendar'} agenda`} className="mt-1 space-y-1">
            {props.events.map((event) => (
              <li key={event.id}>
                <AgendaEntry event={event} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
