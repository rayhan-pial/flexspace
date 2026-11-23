import { Trash2 } from 'lucide-react'
import type { FormEvent } from 'react'
import { useId, useState } from 'react'
import type { Command } from '../../domain/workspace/commands'
import { MAX_LIST_ITEMS, MAX_TEXT } from '../../domain/workspace/constants'
import { newId } from '../../domain/workspace/ids'
import { addTask, removeTask, setTaskDone, setTaskText } from '../../domain/workspace/tasks'
import type { TaskItem, TasksProps } from '../../domain/workspace/types'
import type { WidgetRenderProps } from '../types'

const inputClass =
  'min-w-0 flex-1 rounded-lg border border-slate-300 bg-white/70 px-2 py-1 text-[length:inherit] text-inherit placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'

interface RowProps {
  item: TaskItem
  editing: boolean
  onDone: (done: boolean) => void
  onRename: (text: string) => boolean
  onDelete: () => void
}

function TaskRow({ item, editing, onDone, onRename, onDelete }: RowProps) {
  // While typing, the text lives here; it is committed on Enter or blur, so a half-edited (even
  // empty) value never reaches the draft and Escape can simply discard it.
  const [typed, setTyped] = useState<string | null>(null)

  function commit() {
    if (typed === null) return
    onRename(typed)
    setTyped(null)
  }

  return (
    <li className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={item.done}
        onChange={(event) => onDone(event.target.checked)}
        aria-label={`Mark "${item.text}" ${item.done ? 'not done' : 'done'}`}
        className="size-4 shrink-0 rounded border-slate-300"
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
          className="shrink-0 rounded p-1 text-slate-500 hover:bg-black/5 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      )}
    </li>
  )
}

/**
 * A checklist. Checking a task works in Edit and Preview (it is a normal draft change, saved only
 * with Save); adding, renaming and deleting are Edit-only. Every change is a typed domain command
 * and a refusal (an empty task, the 100-task limit) is shown instead of being swallowed.
 */
export default function TasksWidget({ widgetId, title, props, mode, dispatch }: WidgetRenderProps<TasksProps>) {
  const editing = mode === 'edit'
  const formId = useId()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
      {props.items.length === 0 ? (
        <p className="text-sm opacity-70">{editing ? 'No tasks yet. Add one below.' : 'No tasks yet.'}</p>
      ) : (
        <>
          <p className="text-xs opacity-70" aria-live="polite">{done} of {props.items.length} done</p>
          <ul aria-label={`${title || 'Tasks'} list`} className="space-y-1.5">
            {props.items.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                editing={editing}
                onDone={(value) => run(setTaskDone(widgetId, item.id, value))}
                onRename={(text) => run(setTaskText(widgetId, item.id, text))}
                onDelete={() => run(removeTask(widgetId, item.id))}
              />
            ))}
          </ul>
        </>
      )}

      {editing && (
        <form onSubmit={onAdd} className="mt-auto flex gap-2 pt-1">
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
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </div>
  )
}
