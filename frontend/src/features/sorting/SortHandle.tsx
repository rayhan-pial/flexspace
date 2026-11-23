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
      className="inline-flex shrink-0 cursor-grab touch-none rounded p-0.5 text-slate-500 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 active:cursor-grabbing"
    >
      <GripVertical aria-hidden="true" className="size-4" />
    </span>
  )
}
