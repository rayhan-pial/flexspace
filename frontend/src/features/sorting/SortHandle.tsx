import { GripVertical } from 'lucide-react'

/**
 * The grip that starts a drag for a sortable item (pointer, or keyboard: Space to lift, arrows to
 * move, Space to drop, Escape to cancel). Only this element is draggable, so interacting with the
 * content of an item (typing, checking, pressing buttons) can never start a drag, and a card inside
 * a section can never drag its section.
 */
export default function SortHandle({ handleRef, label }: { handleRef: (element: Element | null) => void; label: string }) {
  return (
    <span
      ref={handleRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      className="ui-focus inline-flex min-h-6 min-w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
    >
      <GripVertical aria-hidden="true" className="size-4" />
    </span>
  )
}
