import { Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { addEvent, removeEvent, setDisplayMonth, updateEvent } from '../../domain/workspace/calendar'
import type { Command } from '../../domain/workspace/commands'
import { MAX_LABEL, MAX_LIST_ITEMS } from '../../domain/workspace/constants'
import { isDate, joinMonth, MAX_YEAR, MIN_YEAR, MONTH_NAMES, splitMonth } from '../../domain/workspace/dates'
import { newId } from '../../domain/workspace/ids'
import type { CalendarProps } from '../../domain/workspace/types'
import { CommitTextField, IntegerField, SelectField } from '../../shared/ui/fields'
import MoveButtons from '../../features/sorting/MoveButtons'
import { listContainerId, workspaceAdapter } from '../../features/sorting/workspaceAdapter'
import type { WidgetInspectorProps } from '../types'

const MONTH_OPTIONS = MONTH_NAMES.map((name, index) => ({ value: String(index + 1), label: name }))
const inputClass =
  'mt-1 block w-full rounded-ui-control border border-ui-control bg-ui-surface px-3 py-1.5 text-sm text-ui-text focus:border-ui-primary ui-focus'

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ui-text">{label}</label>
      {/* A native date input only ever reports a complete, valid date or an empty value. */}
      <input id={id} type="date" min={`${MIN_YEAR}-01-01`} max={`${MAX_YEAR}-12-31`} value={value} onChange={(e) => isDate(e.target.value) && onChange(e.target.value)} className={inputClass} />
    </div>
  )
}

/** Display month and the agenda events (date and title) of the selected calendar. */
export default function CalendarInspector({ widgetId, props, dispatch }: WidgetInspectorProps<CalendarProps>) {
  const [error, setError] = useState<string | null>(null)

  function run(command: Command): boolean {
    const result = dispatch(command)
    setError(result.ok ? null : result.error)
    return result.ok
  }

  const { year, month } = splitMonth(props.displayMonth)

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-medium uppercase tracking-wide text-ui-muted">Calendar</legend>
      <SelectField label="Display month" value={String(month)} options={MONTH_OPTIONS} onChange={(value) => run(setDisplayMonth(widgetId, joinMonth(year, Number(value))))} />
      <IntegerField label="Display year" value={year} min={MIN_YEAR} max={MAX_YEAR} onChange={(value) => run(setDisplayMonth(widgetId, joinMonth(value, month)))} />

      <p className="pt-1 text-xs font-medium uppercase tracking-wide text-ui-muted">Agenda events ({props.events.length})</p>
      {props.events.length === 0 && <p className="text-sm text-ui-muted">No events yet.</p>}
      <ul className="space-y-3">
        {props.events.map((event, index) => {
          const name = `event ${index + 1}`
          return (
            <li key={event.id} className="space-y-2 rounded-xl bg-ui-subtle p-3 ring-1 ring-ui-border">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <DateField label={`Date for ${name}`} value={event.date} onChange={(date) => run(updateEvent(widgetId, event.id, { date }))} />
                </div>
                <button
                  type="button"
                  onClick={() => run(removeEvent(widgetId, event.id))}
                  aria-label={`Remove ${name}`}
                  className="mb-1 rounded p-1 text-ui-muted hover:bg-ui-border hover:text-red-700 ui-focus"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
              <CommitTextField label={`Title for ${name}`} value={event.title} maxLength={MAX_LABEL} onCommit={(title) => run(updateEvent(widgetId, event.id, { title }))} />
              <MoveButtons adapter={workspaceAdapter} itemId={event.id} containerId={listContainerId('calendar', widgetId)} otherContainers={[]} subject={name} />
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        disabled={props.events.length >= MAX_LIST_ITEMS}
        onClick={() => run(addEvent(widgetId, newId('event'), `${props.displayMonth}-01`, 'New event'))}
        className="rounded-ui-control border border-ui-control px-3 py-1.5 text-sm font-medium text-ui-text hover:bg-ui-subtle ui-focus disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add event
      </button>
      {error && <p role="alert" className="rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">{error}</p>}
    </fieldset>
  )
}
