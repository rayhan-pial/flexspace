import { Trash2 } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { useId, useState } from 'react'
import type { Command } from '../../domain/workspace/commands'
import { MAX_LIST_ITEMS, MAX_TEXT } from '../../domain/workspace/constants'
import { newId } from '../../domain/workspace/ids'
import { addTask, removeTask, setTaskDone, setTaskText } from '../../domain/workspace/tasks'
import type { TaskItem, TasksProps } from '../../domain/workspace/types'
import SortHandle from '../../features/sorting/SortHandle'
import SortableSection from '../../features/sorting/SortableSection'
import { useOptionalSortContext } from '../../features/sorting/sortContext'
import { listContainerId, lookupListItem, TASK_ITEM_TYPE } from '../../features/sorting/workspaceAdapter'
import type { WidgetRenderProps } from '../types'

const inputClass = 'fs-field min-w-[3.5rem] flex-1 rounded-lg px-2 py-1 text-[length:inherit]'

interface RowProps {
  item: TaskItem
  editing: boolean
  /** The drag grip, present only while rows are sortable. */
  handle?: ReactNode
  onDone: (done: boolean) => void
  onRename: (text: string) => boolean
  onDelete: () => void
}

function TaskRow({ item, editing, handle, onDone, onRename, onDelete }: RowProps) {
  // While typing, the text lives here; it is committed on Enter or blur, so a half-edited (even
  // empty) value never reaches the draft and Escape can simply discard it.
  const [typed, setTyped] = useState<string | null>(null)

  function commit() {
    if (typed === null) return
    onRename(typed)
    setTyped(null)
  }

  return (
    // Wraps instead of squeezing the text field to nothing when the widget is at its narrowest.
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {handle}
      <input
        type="checkbox"
        checked={item.done}
        onChange={(event) => onDone(event.target.checked)}
        aria-label={`Mark "${item.text}" ${item.done ? 'not done' : 'done'}`}
        className="size-4 shrink-0 accent-[var(--fs-primary,#6366f1)]"
      />
      {editing ? (
        <input
          type="text"
          aria-label={`Task text: ${item.text}`}
          value={typed ?? item.text}
          maxLength={MAX_TEXT}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') setTyped(null)
          }}
          className={`${inputClass} ${item.done ? 'line-through opacity-60' : ''}`}
        />
      ) : (
        <span className={`min-w-0 flex-1 break-words ${item.done ? 'line-through opacity-60' : ''}`}>{item.text}</span>
      )}
      {editing && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete task "${item.text}"`}
          className="ui-focus shrink-0 rounded p-1 opacity-60 hover:bg-black/5 hover:text-red-700 hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:p-3"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  )
}

/**
 * A checklist. Checking a task works in Edit and Preview (it is a normal draft change, saved only
 * with Save); adding, renaming, deleting and reordering are Edit-only. Every change is a typed
 * domain command and a refusal (an empty task, the 100-task limit) is shown instead of being
 * swallowed. In Edit the rows are a sortable container, so a task can be reordered or dragged into
 * another Tasks widget (an empty list is a drop target); the grip is the only draggable part, so
 * typing, checking or pressing buttons in a row can never start a drag.
 */
export default function TasksWidget({ widgetId, title, props, mode, dispatch }: WidgetRenderProps<TasksProps>) {
  const editing = mode === 'edit'
  const formId = useId()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const hasSorting = useOptionalSortContext() !== null
  const sortable = editing && hasSorting

  function run(command: Command): boolean {
    const result = dispatch(command)
    setError(result.ok ? null : result.error)
    return result.ok
  }

  function onAdd(event: FormEvent) {
    event.preventDefault()
    if (run(addTask(widgetId, newId('task'), draft))) setDraft('')
  }

  const done = props.items.filter((item) => item.done).length
  const row = (item: TaskItem, handle?: ReactNode) => (
    <TaskRow
      item={item}
      editing={editing}
      handle={handle}
      onDone={(value) => run(setTaskDone(widgetId, item.id, value))}
      onRename={(text) => run(setTaskText(widgetId, item.id, text))}
      onDelete={() => run(removeTask(widgetId, item.id))}
    />
  )

  return (
    <div className="fs-scroll flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
      {props.items.length > 0 && <p className="text-xs opacity-70" aria-live="polite">{done} of {props.items.length} done</p>}

      {sortable ? (
        <SortableSection
          containerId={listContainerId('tasks', widgetId)}
          itemType={TASK_ITEM_TYPE}
          items={props.items.map((item) => item.id)}
          orientation="vertical"
          label={`${title || 'Tasks'} list`}
          emptyLabel="No tasks yet. Add one below, or drag a task here."
          className="gap-1.5"
          renderItem={(id, { handleRef }) => {
            // A task being dragged in from another Tasks widget is previewed here, so look it up in the whole draft.
            const item = props.items.find((entry) => entry.id === id) ?? lookupListItem<TaskItem>('tasks', id)
            return item ? row(item, <SortHandle handleRef={handleRef} label={`Reorder task ${item.text}`} />) : null
          }}
        />
      ) : props.items.length === 0 ? (
        <p className="text-sm opacity-70">{editing ? 'No tasks yet. Add one below.' : 'No tasks yet.'}</p>
      ) : (
        <ul aria-label={`${title || 'Tasks'} list`} className="space-y-1.5">
          {props.items.map((item) => (
            <li key={item.id}>{row(item)}</li>
          ))}
        </ul>
      )}

      {editing && (
        <form onSubmit={onAdd} className="mt-auto flex flex-wrap gap-2 pt-1">
          <label htmlFor={formId} className="sr-only">New task</label>
          <input
            id={formId}
            type="text"
            value={draft}
            maxLength={MAX_TEXT}
            placeholder="Add a task…"
            disabled={props.items.length >= MAX_LIST_ITEMS}
            onChange={(event) => setDraft(event.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={draft.trim() === '' || props.items.length >= MAX_LIST_ITEMS}
            className="ui-focus shrink-0 rounded-lg bg-ui-primary px-3 py-1 text-sm font-medium text-white hover:bg-ui-primary-hover disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
          >
            Add
          </button>
        </form>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  )
}
