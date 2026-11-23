import { useDroppable } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { SortableKeyboardPlugin } from '@dnd-kit/dom/sortable'
import type { ReactNode } from 'react'
import { useSortContext } from './sortContext'
import type { ContainerData, SortableData } from './types'

// dnd-kit's CollisionPriority.Low: item targets win over their container when both collide.
const LOW_COLLISION_PRIORITY = 1

// dnd-kit's optimistic sorting moves DOM nodes itself, which collides with React re-rendering the
// moved items. We keep keyboard support and let React render the transient preview instead.
const SORTABLE_PLUGINS = [SortableKeyboardPlugin]

export interface ItemState {
  index: number
  isDragging: boolean
  /** Attach to the element that should start a drag (pointer or keyboard). */
  handleRef: (element: Element | null) => void
}

interface SectionProps {
  containerId: string
  /** Ordered item ids, read from the domain (the draft), never from DOM state. */
  items: readonly string[]
  itemType: string
  /** `grid`: the caller supplies the grid classes (for example a tile gallery). */
  orientation: 'horizontal' | 'vertical' | 'grid'
  label: string
  /** Which item types and source containers this container takes; defaults to its own item type. */
  accepts?: (item: { itemType: string; fromContainerId: string }) => boolean
  /** Shown (and used as an explicit drop target) when the container is empty. */
  emptyLabel: string
  className?: string
  renderItem: (id: string, state: ItemState) => ReactNode
}

type Accept = NonNullable<Parameters<typeof useDroppable>[0]['accept']>

function acceptFor(itemType: string, accepts: SectionProps['accepts']): Accept {
  return (draggable) =>
    draggable.type === itemType &&
    (accepts ? accepts({ itemType: String(draggable.type), fromContainerId: String((draggable.data as Partial<SortableData>)?.containerId) }) : true)
}

function SortableItem({ id, index, containerId, itemType, accepts, renderItem }: {
  id: string; index: number; containerId: string; itemType: string
  accepts: SectionProps['accepts']; renderItem: SectionProps['renderItem']
}) {
  const data: SortableData = { itemId: id, containerId, itemType }
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    group: containerId,
    type: itemType,
    data,
    plugins: SORTABLE_PLUGINS,
    transition: null, // no DOM transitions: React re-renders the preview order directly
    accept: acceptFor(itemType, accepts),
  })
  return <li ref={ref} className={isDragging ? 'opacity-50' : undefined}>{renderItem(id, { index, isDragging, handleRef })}</li>
}

/**
 * One ordered, reorderable container. The same component serves every surface (navigation groups,
 * sections, stack cards, list rows); what differs is only the container id, item type, policy and
 * item renderer. While a drag is running it shows the provider's preview order, and an empty
 * container is an explicit drop target, so items can be moved into it.
 */
export default function SortableSection({ containerId, items, itemType, orientation, label, accepts, emptyLabel, className, renderItem }: SectionProps) {
  const { preview } = useSortContext()
  const shown = preview?.[containerId] ?? items
  const containerData: ContainerData = { kind: 'container', containerId, itemType }
  const { ref, isDropTarget } = useDroppable({
    id: containerId,
    type: 'container',
    data: containerData,
    collisionPriority: LOW_COLLISION_PRIORITY,
    accept: acceptFor(itemType, accepts),
  })

  return (
    <ul
      ref={ref}
      aria-label={label}
      data-container-id={containerId}
      data-item-type={itemType}
      className={`${orientation === 'horizontal' ? 'flex flex-row flex-wrap gap-1' : orientation === 'vertical' ? 'flex flex-col gap-1' : 'grid'} ${isDropTarget ? 'rounded-lg ring-2 ring-indigo-300' : ''} ${className ?? ''}`}
    >
      {shown.map((id, index) => (
        <SortableItem key={id} id={id} index={index} containerId={containerId} itemType={itemType} accepts={accepts} renderItem={renderItem} />
      ))}
      {shown.length === 0 && <li className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs opacity-70">{emptyLabel}</li>}
    </ul>
  )
}
