import { useState } from 'react'
import type { MoveOutcome, SortAdapter } from './types'

const button =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50'

interface Props {
  adapter: SortAdapter
  itemId: string
  containerId: string
  /** The other containers this item may be moved to (shown as "Move to <label>"). */
  otherContainers: ReadonlyArray<{ id: string; label: string }>
  /** Names the item in each button's accessible name ("Move up Photo 2") when several sets share a page. */
  subject?: string
}

/**
 * Button alternative to dragging: Move up, Move down and Move to <other container>. They call the
 * very same adapter command as a drag, so keyboard users and pointer users get identical rules.
 */
export default function MoveButtons({ adapter, itemId, containerId, otherContainers, subject }: Props) {
  const [error, setError] = useState<string | null>(null)
  const items = adapter.readItems(containerId) ?? []
  const index = items.indexOf(itemId)

  const name = (action: string) => (subject ? `${action} ${subject}` : action)

  function move(toContainerId: string, toIndex: number) {
    const outcome: MoveOutcome = adapter.commitMove({ itemId, fromContainerId: containerId, toContainerId, toIndex })
    setError(outcome.status === 'rejected' ? outcome.error : null)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={index <= 0} onClick={() => move(containerId, index - 1)} aria-label={name('Move up')} className={button}>Move up</button>
        <button type="button" disabled={index === -1 || index >= items.length - 1} onClick={() => move(containerId, index + 1)} aria-label={name('Move down')} className={button}>Move down</button>
        {otherContainers.map((container) => (
          <button key={container.id} type="button" onClick={() => move(container.id, adapter.readItems(container.id)?.length ?? 0)} aria-label={name(`Move to ${container.label}`)} className={button}>
            Move to {container.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>}
    </div>
  )
}
