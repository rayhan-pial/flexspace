import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { formatDate, monthOf, monthTitle, monthWeeks, shiftMonth } from '../../domain/workspace/dates'
import type { CalendarProps } from '../../domain/workspace/types'
import type { WidgetRenderProps } from '../types'

const WEEKDAYS = [['Sun', 'Sunday'], ['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday']] as const

const navButton =
  'rounded p-1 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40'

/**
 * A month grid plus the agenda. The grid is always chronological; the agenda lists the saved
 * events in their stored array order. Browsing to another month is transient state kept here: it
 * never writes to the draft (so it cannot dirty the workspace) and it resets whenever the saved
 * display month changes. Events and the display month are edited from the inspector.
 */
export default function CalendarWidget({ title, props, mode }: WidgetRenderProps<CalendarProps>) {
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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
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
          <button type="button" onClick={() => setBrowse(null)} className="mt-1 text-xs underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            Back to {monthTitle(props.displayMonth)}
          </button>
        )}

        <table aria-label={`${title || 'Calendar'}, ${monthTitle(shown)}`} className="mt-2 w-full table-fixed border-collapse text-center text-xs">
          <thead>
            <tr>
              {WEEKDAYS.map(([short, full]) => (
                <th key={short} scope="col" className="pb-1 font-medium opacity-70"><abbr title={full} className="no-underline">{short}</abbr></th>
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
                    <td key={column} title={events?.join(', ')} className="p-0.5">
                      <span className={`relative mx-auto flex size-7 items-center justify-center rounded-full tabular-nums ${events ? 'bg-[var(--fs-primary,#6366f1)] font-semibold text-white' : ''}`}>
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

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Agenda</p>
        {props.events.length === 0 ? (
          <p className="mt-1 text-sm opacity-70">{mode === 'edit' ? 'No events yet. Select this widget and add some in Properties.' : 'No events yet.'}</p>
        ) : (
          <ul aria-label={`${title || 'Calendar'} agenda`} className="mt-1 space-y-1">
            {props.events.map((event) => (
              <li key={event.id} className="flex items-baseline gap-2 text-sm">
                <time dateTime={event.date} className="shrink-0 text-xs tabular-nums opacity-70">{formatDate(event.date)}</time>
                <span className="min-w-0 break-words">{event.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
