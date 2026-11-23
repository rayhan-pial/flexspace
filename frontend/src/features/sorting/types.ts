/** A move named by stable ids. `toIndex` is the item's final index in the destination container. */
export interface MoveRequest {
  itemId: string
  fromContainerId: string
  toContainerId: string
  toIndex: number
}

export type MoveOutcome = { status: 'applied' } | { status: 'noop' } | { status: 'rejected'; error: string }

/**
 * What a sortable surface needs from the domain. Every way of moving an item (pointer drag,
 * keyboard, Move buttons) ends in `commitMove`, so they can never disagree about the rules.
 */
export interface SortAdapter {
  /** The ordered item ids of a container, or `null` if the container is unknown. */
  readItems(containerId: string): string[] | null
  /** `null` when the move is allowed, otherwise the reason it is not. Checked again inside `commitMove`. */
  canMove(request: MoveRequest): string | null
  /** Resolve the item by id against the current draft and apply one atomic domain command. */
  commitMove(request: MoveRequest): MoveOutcome
}

/** What a draggable carries so drop targets and the provider can reason about it. */
export interface SortableData {
  itemId: string
  containerId: string
  itemType: string
}

/** What a container's droppable carries. */
export interface ContainerData {
  kind: 'container'
  containerId: string
  itemType: string
}
