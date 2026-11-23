import type { NavItem, Navigation } from '../../domain/workspace/types'
import { navIcon } from './navIcons'

function scrollToSection(sectionId: string) {
  const target = document.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`)
  if (!target) return
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}

/**
 * Temporary navigation shell: one list of buttons for both groups. It honours the saved placement
 * (top bar, or a side column on wide screens). Icons, editing and reordering arrive in FS-014/019.
 */
export default function SimpleNav({ navigation }: { navigation: Navigation }) {
  const groups: Array<{ label: string; items: NavItem[] }> = [
    { label: 'Primary', items: navigation.primaryItems },
    { label: 'Secondary', items: navigation.secondaryItems },
  ].filter((group) => group.items.length > 0)
  if (groups.length === 0) return null

  const vertical = navigation.placement !== 'top'
  return (
    <nav aria-label="Workspace" className={`flex gap-4 ${vertical ? 'flex-wrap lg:w-48 lg:shrink-0 lg:flex-col' : 'flex-wrap'}`}>
      {groups.map((group) => (
        <ul key={group.label} aria-label={`${group.label} navigation`} className={`flex gap-1 ${vertical ? 'flex-wrap lg:flex-col' : 'flex-wrap'}`}>
          {group.items.map((item) => {
            const Icon = navIcon(item.icon)
            return (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.targetSectionId === null}
                onClick={() => item.targetSectionId && scrollToSection(item.targetSectionId)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium text-[color:var(--fs-primary,#6366f1)] hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {item.label}
              </button>
            </li>
            )
          })}
        </ul>
      ))}
    </nav>
  )
}
