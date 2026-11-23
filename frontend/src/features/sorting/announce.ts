/**
 * Plain-language status messages for sorting, read out by screen readers through a live region.
 * They name the item as its grip does ("Reorder task Call Sam" gives "task Call Sam") and the list
 * as the list is labelled on the page, never by internal ids.
 */

/** The spoken name of a dragged item, taken from its grip's accessible name. */
export function itemLabelOf(source: unknown): string {
  const draggable = source as { handle?: Element | null; element?: Element | null } | null
  const named = draggable?.handle ?? draggable?.element?.querySelector('[aria-label^="Reorder "]') ?? null
  const label = named?.getAttribute('aria-label') ?? ''
  const stripped = label.replace(/^Reorder\s+/, '').trim()
  return stripped || 'item'
}

/** The accessible name of a container as it appears on the page. */
export function containerLabelOf(containerId: string, root: ParentNode = document): string {
  for (const element of root.querySelectorAll('[data-container-id]')) {
    if (element.getAttribute('data-container-id') === containerId) return element.getAttribute('aria-label') ?? 'this list'
  }
  return 'this list'
}

const where = (index: number, total: number, container: string) => `position ${index + 1} of ${total} in ${container}`

export const pickedUp = (label: string) => `Picked up ${label}.`
export const movedTo = (label: string, index: number, total: number, container: string) => `${label}: ${where(index, total, container)}.`
export const droppedAt = (label: string, index: number, total: number, container: string) => `Dropped ${label} at ${where(index, total, container)}.`
export const cancelled = (label: string) => `Cancelled. ${label} stays where it was.`
export const droppedUnchanged = (label: string) => `Dropped ${label} in its original place.`
export const droppedOutside = (label: string) => `Dropped ${label} outside any list, so nothing moved.`
export const movedByButton = (index: number, total: number) => `Moved to position ${index + 1} of ${total}.`
