import { moveBetween } from '../../domain/workspace/reorder'
import type { ContainerData, MoveRequest, SortableData, SortAdapter } from './types'

/**
 * While a drag is in progress the provider keeps a *preview* of the affected containers: the item
 * ids as they would be if the drag ended now. React renders from it, so React (not dnd-kit) owns
 * the DOM, and cancelling is simply discarding the preview. Only containers the drag touched appear.
 */
export type Preview = Record<string, string[]>

/** What the pointer is over: another sortable item, or a container (this is how an empty one is targeted). */
export type TargetFacts = { kind: 'item'; id: string; containerId: string } | { kind: 'container'; containerId: string }

export interface SourceFacts { id: string; containerId: string }

/** Extract plain facts from dnd-kit's drag source and target, so everything below stays testable. */
export function dragFacts(source: unknown, target: unknown): { source: SourceFacts | null; target: TargetFacts | null } {
  const src = source as { id: string | number; data?: Partial<SortableData> } | null
  const tgt = target as { id: string | number; data?: Partial<SortableData & ContainerData> } | null
  const sourceFacts =
    src && src.data?.containerId !== undefined ? { id: String(src.data.itemId ?? src.id), containerId: src.data.containerId } : null
  let targetFacts: TargetFacts | null = null
  if (tgt?.data?.kind === 'container' && tgt.data.containerId !== undefined) targetFacts = { kind: 'container', containerId: tgt.data.containerId }
  else if (tgt?.data?.containerId !== undefined) targetFacts = { kind: 'item', id: String(tgt.data.itemId ?? tgt.id), containerId: tgt.data.containerId }
  return { source: sourceFacts, target: targetFacts }
}

/** Where the previewed lists currently hold `itemId`, or `null` if the drag has not moved it. */
export function previewPlacement(preview: Preview | null, itemId: string): { containerId: string; index: number } | null {
  if (!preview) return null
  for (const [containerId, ids] of Object.entries(preview)) {
    const index = ids.indexOf(itemId)
    if (index !== -1) return { containerId, index }
  }
  return null
}

/**
 * The preview after the pointer moved over `target`. The item takes the place of the item it is
 * over (or the end of a container it is over). Targets the adapter would refuse change nothing, so
 * an incompatible container never shows a misleading preview. Returns the same object if unchanged.
 */
export function hoverPreview(
  preview: Preview | null,
  source: SourceFacts | null,
  target: TargetFacts | null,
  adapter: SortAdapter,
): Preview | null {
  if (!source || !target) return preview
  if (target.kind === 'item' && target.id === source.id) return preview

  const current = (containerId: string): string[] | null => preview?.[containerId] ?? adapter.readItems(containerId)
  const holder = [source.containerId, target.containerId, ...Object.keys(preview ?? {})].find((id) => current(id)?.includes(source.id))
  const destination = current(target.containerId)
  if (holder === undefined || !destination) return preview
  if (adapter.canMove({ itemId: source.id, fromContainerId: source.containerId, toContainerId: target.containerId, toIndex: 0 })) return preview

  const toIndex = target.kind === 'item' ? destination.indexOf(target.id) : destination.length
  if (toIndex === -1) return preview
  if (target.kind === 'container' && holder === target.containerId) return preview

  const lists: Record<string, Array<{ id: string }>> = { [holder]: (current(holder) ?? []).map((id) => ({ id })) }
  lists[target.containerId] ??= destination.map((id) => ({ id }))
  const moved = moveBetween(lists, source.id, target.containerId, toIndex)
  if (!moved || moved.lists === lists) return preview

  const next: Preview = { ...preview }
  for (const containerId of Object.keys(lists)) next[containerId] = moved.lists[containerId].map((entry) => entry.id)
  return next
}

export interface DropFacts {
  canceled: boolean
  /** The dragged item with the container it came from when the drag began. */
  source: SourceFacts | null
  /** Whether the pointer ended over a target (an item, a container, or inside a container's bounds). */
  overTarget: boolean
  /** Where the preview left the item, or `null` if the drag never moved it. */
  placement: { containerId: string; index: number } | null
}

export interface Point { x: number; y: number }
export interface Bounds { left: number; right: number; top: number; bottom: number }

/** Whether a point lies inside any of the rectangles (used to tell "dropped outside" from "dropped on a target"). */
export function pointInside(point: Point | null | undefined, rects: readonly Bounds[]): boolean {
  if (!point) return false
  return rects.some((r) => point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom)
}

export type DropDecision = { request: MoveRequest } | { ignore: string }

/**
 * Turn a finished drag into one move request, or an explanation of why nothing happens. Escape
 * (canceled), an outside drop and a drop that moved nothing all yield "ignore", so they never
 * change data. Incompatible destinations are refused by the adapter, with its reason.
 */
export function resolveDrop(facts: DropFacts, adapter: SortAdapter): DropDecision {
  const { canceled, source, overTarget, placement } = facts
  if (canceled) return { ignore: 'canceled' }
  if (!source) return { ignore: 'no source' }
  if (!overTarget) return { ignore: 'dropped outside' }
  if (!placement) return { ignore: 'unchanged' }

  const request: MoveRequest = { itemId: source.id, fromContainerId: source.containerId, toContainerId: placement.containerId, toIndex: placement.index }
  const refusal = adapter.canMove(request)
  if (refusal) return { ignore: refusal }
  return { request }
}

/** Reasons that mean "nothing happened, and that is fine" (no message is shown for them). */
export const QUIET_IGNORES: readonly string[] = ['canceled', 'dropped outside', 'unchanged', 'no source']
