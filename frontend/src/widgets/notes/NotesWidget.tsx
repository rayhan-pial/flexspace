import { useId } from 'react'
import type { NotesProps } from '../../domain/workspace/types'
import type { WidgetRenderProps } from '../types'

export const NOTES_MAX = 10_000

/**
 * Plain-text note. The body is rendered only as a textarea value (never as HTML), so anything a
 * user types, including markup, is shown literally. Editable in both Edit and Preview.
 */
export default function NotesWidget({ title, props, mode, onChangeProps }: WidgetRenderProps<NotesProps>) {
  const countId = useId()
  const editing = mode === 'edit'
  const atLimit = props.body.length >= NOTES_MAX
  const nearLimit = props.body.length >= NOTES_MAX * 0.9
  return (
    <div className="flex h-full min-h-0 flex-col">
      <textarea
        aria-label={`${title || 'Note'} text`}
        aria-describedby={editing || nearLimit ? countId : undefined}
        value={props.body}
        maxLength={NOTES_MAX}
        placeholder="Write a note…"
        onChange={(event) => onChangeProps({ body: event.target.value })}
        className={`min-h-24 w-full flex-1 resize-none rounded-lg bg-transparent p-2 text-[length:inherit] leading-relaxed placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          editing ? 'border border-slate-300 bg-white/60' : 'border border-transparent'
        }`}
      />
      {(editing || nearLimit) && (
        <p
          id={countId}
          aria-live="polite"
          className={`mt-1 text-right text-xs ${atLimit ? 'font-medium text-rose-700' : nearLimit ? 'text-amber-700' : 'text-slate-500'}`}
        >
          {props.body.length.toLocaleString()} / {NOTES_MAX.toLocaleString()}
          {atLimit && ' · Limit reached'}
        </p>
      )}
    </div>
  )
}
