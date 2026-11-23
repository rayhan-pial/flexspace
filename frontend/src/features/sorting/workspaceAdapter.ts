import { KNOWN_WIDGET_TYPES, MAX_LIST_ITEMS } from '../../domain/workspace/constants'
import type { WorkspaceConfig } from '../../domain/workspace/types'
import { moveListItem, moveNavItem, moveSection, moveStackWidget } from '../../domain/workspace/reorder'
import type { ListKind, NavGroup } from '../../domain/workspace/reorder'
import { useEditorStore } from '../editor/editorStore'
import type { MoveOutcome, MoveRequest, SortAdapter } from './types'

/*
 * The one adapter between the shared sortable abstraction and the workspace draft. Container ids
 * are derived, namespaced names (never persisted):
 *   nav:primary, nav:secondary   navigation groups          (items of type `nav-item`)
 *   sections:root                the workspace sections     (items of type `section`)
 *   section:<id>:widgets         a stack section's cards    (items of type `widget`)
 *   widget:<id>:tasks            a Tasks widget's rows      (items of type `task`)
 *   widget:<id>:gallery          a Gallery widget's tiles   (items of type `gallery-item`)
 * Items only move between containers of the same kind, which is what keeps a card from becoming a
 * navigation item or a nested section. Later tasks (task rows, gallery tiles, ...) add kinds here.
 */

export const NAV_PRIMARY = 'nav:primary'
export const NAV_SECONDARY = 'nav:secondary'
export const SECTIONS_ROOT = 'sections:root'
export const NAV_ITEM_TYPE = 'nav-item'
export const SECTION_ITEM_TYPE = 'section'
export const WIDGET_ITEM_TYPE = 'widget'
export const TASK_ITEM_TYPE = 'task'
export const GALLERY_ITEM_TYPE = 'gallery-item'

export const stackContainerId = (sectionId: string) => `section:${sectionId}:widgets`
export const listContainerId = (kind: ListKind, widgetId: string) => `widget:${widgetId}:${kind}`

type Container =
  | { kind: 'nav'; group: NavGroup }
  | { kind: 'sections' }
  | { kind: 'widgets'; sectionId: string }
  | { kind: ListKind; widgetId: string }

const NAV_GROUPS: Record<string, NavGroup> = { [NAV_PRIMARY]: 'primaryItems', [NAV_SECONDARY]: 'secondaryItems' }
const STACK_RE = /^section:([A-Za-z0-9_-]{1,64}):widgets$/
const LIST_RE = /^widget:([A-Za-z0-9_-]{1,64}):(tasks|gallery)$/

function parse(containerId: string): Container | null {
  if (Object.hasOwn(NAV_GROUPS, containerId)) return { kind: 'nav', group: NAV_GROUPS[containerId] }
  if (containerId === SECTIONS_ROOT) return { kind: 'sections' }
  const stack = STACK_RE.exec(containerId)
  if (stack) return { kind: 'widgets', sectionId: stack[1] }
  const list = LIST_RE.exec(containerId)
  return list ? { kind: list[2] as ListKind, widgetId: list[1] } : null
}

/** The ids a container currently shows: hidden sections and cards are not drawn, so they are not listed. */
function itemsOf(draft: WorkspaceConfig, container: Container): string[] | null {
  switch (container.kind) {
    case 'nav':
      return draft.navigation[container.group].map((item) => item.id)
    case 'sections':
      return draft.sections.filter((s) => !s.hidden).map((s) => s.id)
    case 'widgets': {
      const section = draft.sections.find((s) => s.id === container.sectionId)
      return section && section.kind === 'stack' ? section.widgets.filter((w) => !w.hidden).map((w) => w.id) : null
    }
    case 'tasks':
    case 'gallery': {
      const widget = draft.sections.flatMap((s) => s.widgets).find((w) => w.id === container.widgetId && w.type === container.kind)
      return widget && Array.isArray(widget.props.items) ? (widget.props.items as Array<{ id: string }>).map((item) => item.id) : null
    }
  }
}

function readItems(containerId: string): string[] | null {
  const draft = useEditorStore.getState().draftConfig
  const container = parse(containerId)
  return draft && container ? itemsOf(draft, container) : null
}

function canMove({ itemId, fromContainerId, toContainerId }: MoveRequest): string | null {
  const from = parse(fromContainerId)
  const to = parse(toContainerId)
  // Items only ever move between containers of the same kind.
  if (!from || !to || from.kind !== to.kind) return 'That item cannot be moved there.'
  // The item must really be where the request says: a stale gesture must not move something else.
  if (!readItems(fromContainerId)?.includes(itemId)) return 'That item is no longer there.'
  if (readItems(toContainerId) === null) return 'That item cannot be moved there.'

  // A list that already holds the maximum number of items takes no more from another widget.
  if ((from.kind === 'tasks' || from.kind === 'gallery') && to.kind === from.kind && from.widgetId !== to.widgetId) {
    if ((readItems(toContainerId)?.length ?? 0) >= MAX_LIST_ITEMS) return `That list already holds ${MAX_LIST_ITEMS} items.`
  }

  // Cards of types this version does not know stay in their own section (they can still be reordered there).
  if (from.kind === 'widgets' && to.kind === 'widgets' && from.sectionId !== to.sectionId) {
    const widget = useEditorStore.getState().draftConfig?.sections.flatMap((s) => s.widgets).find((w) => w.id === itemId)
    if (!widget || !(KNOWN_WIDGET_TYPES as readonly string[]).includes(widget.type)) return 'Unsupported widgets can only be reordered within their own section.'
  }
  return null
}

function commitMove(request: MoveRequest): MoveOutcome {
  const refusal = canMove(request)
  if (refusal) return { status: 'rejected', error: refusal }
  const to = parse(request.toContainerId)!
  const command =
    to.kind === 'nav'
      ? moveNavItem(request.itemId, to.group, request.toIndex)
      : to.kind === 'sections'
        ? moveSection(request.itemId, request.toIndex)
        : to.kind === 'widgets'
          ? moveStackWidget(request.itemId, to.sectionId, request.toIndex)
          : moveListItem(to.kind, request.itemId, to.widgetId, request.toIndex)
  const result = useEditorStore.getState().apply(command)
  return result.status === 'rejected' ? { status: 'rejected', error: result.error } : { status: result.status }
}

export const workspaceAdapter: SortAdapter = { readItems, canMove, commitMove }

/** An item of a Tasks or Gallery list by id, from anywhere in the draft (used to draw an item previewed in another widget). */
export function lookupListItem<T extends { id: string }>(kind: ListKind, itemId: string): T | undefined {
  const draft = useEditorStore.getState().draftConfig
  for (const section of draft?.sections ?? []) {
    for (const widget of section.widgets) {
      if (widget.type !== kind || !Array.isArray(widget.props.items)) continue
      const found = (widget.props.items as T[]).find((item) => item.id === itemId)
      if (found) return found
    }
  }
  return undefined
}

/** Other widgets of the same type that an item may be moved into, as destination containers for Move buttons. */
export function transferTargets(kind: ListKind, excludeWidgetId: string): Array<{ id: string; label: string }> {
  const draft = useEditorStore.getState().draftConfig
  return (draft?.sections ?? []).flatMap((section) =>
    section.widgets
      .filter((w) => w.type === kind && w.id !== excludeWidgetId && !w.hidden && !section.hidden)
      .map((w) => ({ id: listContainerId(kind, w.id), label: w.title || (kind === 'tasks' ? 'Tasks' : 'Gallery') })),
  )
}
