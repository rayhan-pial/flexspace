import { useDroppable } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom'
import { SortableKeyboardPlugin } from '@dnd-kit/dom/sortable'
import type { ReactNode } from 'react'
import { useSortContext } from './sortContext'
import type { ContainerData, SortableData } from './types'

// dnd-kit's CollisionPriority.Low: item targets win over their container when both collide.
const LOW_COLLISION_PRIORITY = 1

// dnd-kit's optimistic sorting moves DOM nodes itself, which collides with React re-rendering the
// moved items. We keep keyboard support and let React render the transient preview instead.
const SORTABLE_PLUGINS = [SortableKeyboardPlugin]
// Cards are grabbed by the whole card, so they must not react to keystrokes typed into their fields (Space would lift the card).
// Only a pointer drags these items. The default pointer sensor already leaves buttons and links alone; a press inside a
// text field or on an inner grip also belongs to that control, so a card can still be typed into and its rows sorted.
const POINTER_ONLY = [
  PointerSensor.configure({
    // A card is the grab area, so a plain click (select it, press inside it) must not become a drag: the pointer has to
    // travel first. A finger waits a moment so scrolling the page still works.
    activationConstraints: (event) =>
      event.pointerType === 'touch'
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 6 })],
    preventActivation: (event, source) => {
      if (PointerSensor.defaults.preventActivation?.(event, source)) return true
      // The drag library marks the grab element itself as role="button", so it must not count as an inner control.
      const inner = (event.target as Element | null)?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="button"], [data-no-drag]') ?? null
      return inner !== null && inner !== source.handle && inner !== source.element
    },
  }),
]

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
  /** Only a pointer starts a drag (the item has fields inside it; the Move buttons are its keyboard alternative). */
  pointerOnly?: boolean
  renderItem: (id: string, state: ItemState) => ReactNode
}

type Accept = NonNullable<Parameters<typeof useDroppable>[0]['accept']>

function acceptFor(itemType: string, accepts: SectionProps['accepts']): Accept {
  return (draggable) =>
    draggable.type === itemType &&
    (accepts ? accepts({ itemType: String(draggable.type), fromContainerId: String((draggable.data as Partial<SortableData>)?.containerId) }) : true)
}

function SortableItem({ id, index, containerId, itemType, accepts, pointerOnly, renderItem }: {
  id: string; index: number; containerId: string; itemType: string
  accepts: SectionProps['accepts']; pointerOnly?: boolean; renderItem: SectionProps['renderItem']
}) {
  const data: SortableData = { itemId: id, containerId, itemType }
  // The outline lists the very same sections and widgets the canvas draws, and the drag library needs every draggable to
  // have its own id, so the outline's items are namespaced; the real id travels in `data.itemId`.
  const dragId = containerId.startsWith('outline') ? `${containerId}~${id}` : id
  const { ref, handleRef, isDragging } = useSortable({
    id: dragId,
    index,
    group: containerId,
    type: itemType,
    data,
    plugins: SORTABLE_PLUGINS,
    ...(pointerOnly && { sensors: POINTER_ONLY }),
    transition: null, // no DOM transitions: React re-renders the preview order directly
    accept: acceptFor(itemType, accepts),
  })
  // While dragged, the item shows where it will land in the transient preview order: raised, with a solid accent outline.
  return <li ref={ref} data-dragging={isDragging ? 'true' : undefined} className={isDragging ? 'rounded-md bg-ui-selected/60 opacity-90 shadow-ui-surface ring-2 ring-ui-primary' : undefined}>{renderItem(id, { index, isDragging, handleRef })}</li>
}

/**
 * One ordered, reorderable container. The same component serves every surface (navigation groups,
 * sections, stack cards, list rows); what differs is only the container id, item type, policy and
 * item renderer. While a drag is running it shows the provider's preview order, and an empty
 * container is an explicit drop target, so items can be moved into it.
 */
export default function SortableSection({ containerId, items, itemType, orientation, label, accepts, emptyLabel, className, pointerOnly, renderItem }: SectionProps) {
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
      className={`${orientation === 'horizontal' ? 'flex flex-row flex-wrap gap-1' : orientation === 'vertical' ? 'flex flex-col gap-1' : 'grid'} ${isDropTarget ? 'rounded-lg ring-2 ring-ui-primary/60' : ''} ${className ?? ''}`}
    >
      {shown.map((id, index) => (
        <SortableItem key={id} id={id} index={index} containerId={containerId} itemType={itemType} accepts={accepts} pointerOnly={pointerOnly} renderItem={renderItem} />
      ))}
      {shown.length === 0 && <li className={`rounded-lg border border-dashed px-3 py-2 text-xs ${isDropTarget ? 'border-ui-primary bg-ui-selected/50' : 'fs-rule opacity-80'}`}>{emptyLabel}</li>}
    </ul>
  )
}
