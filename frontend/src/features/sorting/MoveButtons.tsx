import { useState } from 'react'
import Button from '../../shared/ui/Button'
import { movedByButton } from './announce'
import type { MoveOutcome, SortAdapter } from './types'

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
  const [status, setStatus] = useState('')
  const items = adapter.readItems(containerId) ?? []
  const index = items.indexOf(itemId)

  const name = (action: string) => (subject ? `${action} ${subject}` : action)

  function move(toContainerId: string, toIndex: number) {
    const outcome: MoveOutcome = adapter.commitMove({ itemId, fromContainerId: containerId, toContainerId, toIndex })
    setError(outcome.status === 'rejected' ? outcome.error : null)
    if (outcome.status === 'applied') {
      const after = adapter.readItems(toContainerId) ?? []
      setStatus(movedByButton(after.indexOf(itemId), after.length))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button reason={index === -1 ? 'This item is no longer in the list.' : index === 0 ? 'Already first.' : null} onClick={() => move(containerId, index - 1)} aria-label={name('Move up')}>Move up</Button>
        <Button reason={index === -1 ? 'This item is no longer in the list.' : index >= items.length - 1 ? 'Already last.' : null} onClick={() => move(containerId, index + 1)} aria-label={name('Move down')}>Move down</Button>
        {otherContainers.map((container) => (
          <Button key={container.id} onClick={() => move(container.id, adapter.readItems(container.id)?.length ?? 0)} aria-label={name(`Move to ${container.label}`)}>
            Move to {container.label}
          </Button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="sr-only">{status}</p>
      {error && <p role="alert" className="mt-2 rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">{error}</p>}
    </div>
  )
}
