import { GripVertical } from 'lucide-react'
import { useMediaQuery } from '../../shared/hooks/useMediaQuery'
import type { NavItem, Navigation } from '../../domain/workspace/types'
import { useEditorStore } from '../editor/editorStore'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import SortableSection from '../sorting/SortableSection'
import { NAV_ITEM_TYPE, NAV_PRIMARY, NAV_SECONDARY } from '../sorting/workspaceAdapter'
import NavIcon from './NavIcon'

/** From this width Edit mode has room for a navigation column beside the canvas. */
export const EDIT_SIDE_NAV_QUERY = '(min-width: 1400px)'

function scrollToSection(sectionId: string) {
  const target = document.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`)
  if (!target) return
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}

function NavLink({ item, editing }: { item: NavItem; editing: boolean }) {
  const select = useEditorStore((s) => s.select)
  const selected = useEditorStore((s) => editing && s.selection?.kind === 'navItem' && s.selection.id === item.id)
  return (
    <button
      type="button"
      // In Edit an unlinked item is still clickable: it selects the item so its target can be set.
      disabled={!editing && item.targetSectionId === null}
      aria-current={selected ? 'true' : undefined}
      onClick={() => {
        if (editing) select({ kind: 'navItem', id: item.id })
        if (item.targetSectionId) scrollToSection(item.targetSectionId)
      }}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium text-[color:var(--fs-primary,#6366f1)] hover:bg-black/5 ui-focus disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent ${
        selected ? 'ring-2 ring-ui-primary' : ''
      }`}
    >
      <NavIcon name={item.icon} className="size-4 shrink-0" />
      {item.label}
    </button>
  )
}

/**
 * The workspace navigation. It honours the saved placement (top bar, or a side column on wide
 * screens). In Preview it is a plain list of links; in Edit each group is a sortable container, so
 * items can be reordered and moved between the Primary and Secondary groups (an empty group is an
 * explicit drop target), by dragging a handle, with the keyboard, or with the Move buttons in the
 * item's properties. All of them end in the same domain command.
 */
export default function SimpleNav({ navigation }: { navigation: Navigation }) {
  const editing = useEffectiveMode() === 'edit'
  const vertical = navigation.placement !== 'top'
  // Edit mode surrounds the canvas with two panels, so a side column only fits on very wide screens.
  const wide = useMediaQuery(EDIT_SIDE_NAV_QUERY, true)
  const groups = [
    { id: NAV_PRIMARY, label: 'Primary', items: navigation.primaryItems },
    { id: NAV_SECONDARY, label: 'Secondary', items: navigation.secondaryItems },
  ]
  const visibleGroups = editing ? groups : groups.filter((group) => group.items.length > 0)
  if (visibleGroups.length === 0) return null

  const sideClass = editing ? 'flex-wrap min-[1400px]:w-48 min-[1400px]:shrink-0 min-[1400px]:flex-col' : 'flex-wrap lg:w-48 lg:shrink-0 lg:flex-col'
  const navClass = `flex gap-4 ${vertical ? sideClass : 'flex-wrap'}`

  if (!editing) {
    return (
      <nav aria-label="Workspace" className={navClass}>
        {visibleGroups.map((group) => (
          <ul key={group.id} aria-label={`${group.label} navigation`} className={`flex gap-1 ${vertical ? 'flex-wrap lg:flex-col' : 'flex-wrap'}`}>
            {group.items.map((item) => (
              <li key={item.id}>
                <NavLink item={item} editing={false} />
              </li>
            ))}
          </ul>
        ))}
      </nav>
    )
  }

  const byId = new Map([...navigation.primaryItems, ...navigation.secondaryItems].map((item) => [item.id, item]))
  return (
    <nav aria-label="Workspace" className={navClass}>
      {groups.map((group) => (
        <div key={group.id} className="min-w-0">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-60">{group.label}</p>
          <SortableSection
            containerId={group.id}
            itemType={NAV_ITEM_TYPE}
            items={group.items.map((item) => item.id)}
            orientation={vertical && wide ? 'vertical' : 'horizontal'}
            label={`${group.label} navigation`}
            emptyLabel={`Drop an item here to add it to ${group.label.toLowerCase()}`}
            renderItem={(id, { handleRef }) => {
              const item = byId.get(id)
              if (!item) return null
              return (
                <div className="flex items-center gap-1">
                  <span
                    ref={handleRef}
                    role="button"
                    tabIndex={0}
                    aria-label={`Reorder ${item.label}`}
                    className="ui-focus inline-flex min-h-6 min-w-6 cursor-grab touch-none items-center justify-center rounded p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
                  >
                    <GripVertical aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <NavLink item={item} editing />
                  </div>
                </div>
              )
            }}
          />
        </div>
      ))}
    </nav>
  )
}
