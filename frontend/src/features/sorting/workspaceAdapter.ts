import { moveNavItem } from '../../domain/workspace/reorder'
import type { NavGroup } from '../../domain/workspace/reorder'
import { useEditorStore } from '../editor/editorStore'
import type { MoveOutcome, MoveRequest, SortAdapter } from './types'

/*
 * The one adapter between the shared sortable abstraction and the workspace draft. Container ids
 * are derived, namespaced names (never persisted): `nav:primary` and `nav:secondary` today; the
 * section, stack-card and list containers of later tasks register here too.
 */

export const NAV_PRIMARY = 'nav:primary'
export const NAV_SECONDARY = 'nav:secondary'
export const NAV_ITEM_TYPE = 'nav-item'

const NAV_GROUPS: Record<string, NavGroup> = { [NAV_PRIMARY]: 'primaryItems', [NAV_SECONDARY]: 'secondaryItems' }
const navGroup = (containerId: string): NavGroup | undefined => (Object.hasOwn(NAV_GROUPS, containerId) ? NAV_GROUPS[containerId] : undefined)

function readItems(containerId: string): string[] | null {
  const draft = useEditorStore.getState().draftConfig
  const group = navGroup(containerId)
  if (!draft || !group) return null
  return draft.navigation[group].map((item) => item.id)
}

function canMove({ itemId, fromContainerId, toContainerId }: MoveRequest): string | null {
  const from = navGroup(fromContainerId)
  const to = navGroup(toContainerId)
  if (!from || !to) return 'That item cannot be moved there.' // only navigation containers exist here
  // The item must really be where the request says: a stale gesture must not move something else.
  if (!readItems(fromContainerId)?.includes(itemId)) return 'That item is no longer there.'
  return null
}

function commitMove(request: MoveRequest): MoveOutcome {
  const refusal = canMove(request)
  if (refusal) return { status: 'rejected', error: refusal }
  const result = useEditorStore.getState().apply(moveNavItem(request.itemId, navGroup(request.toContainerId)!, request.toIndex))
  return result.status === 'rejected' ? { status: 'rejected', error: result.error } : { status: result.status }
}

export const workspaceAdapter: SortAdapter = { readItems, canMove, commitMove }
