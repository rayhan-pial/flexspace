import { NAV_PLACEMENTS } from '../../domain/workspace/constants'
import { setNavPlacement } from '../../domain/workspace/navigation'
import type { NavItem, NavPlacement } from '../../domain/workspace/types'
import { SelectField } from '../../shared/ui/fields'
import { useEditorStore } from './editorStore'

const PLACEMENT_LABELS: Record<NavPlacement, string> = { top: 'Top bar', left: 'Left sidebar', right: 'Right sidebar' }

/** Navigation placement plus its items (both groups) as selectable outline entries. */
export default function NavigationPanel() {
  const navigation = useEditorStore((s) => s.draftConfig?.navigation)
  const selection = useEditorStore((s) => s.selection)
  const apply = useEditorStore((s) => s.apply)
  const select = useEditorStore((s) => s.select)
  if (!navigation) return null

  const group = (name: string, items: NavItem[]) =>
    items.length === 0 ? null : (
      <ul aria-label={`${name} navigation items`} className="space-y-1">
        {items.map((item) => {
          const selected = selection?.kind === 'navItem' && selection.id === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => select({ kind: 'navItem', id: item.id })}
                className={`flex w-full rounded-ui-control px-2 py-1.5 text-left text-sm ui-focus ${
                  selected ? 'bg-ui-selected font-medium text-ui-selected-text ring-1 ring-ui-primary/40' : 'text-ui-text hover:bg-ui-subtle'
                }`}
              >
                <span className="truncate">{item.label || 'Untitled link'}</span>
              </button>
            </li>
          )
        })}
      </ul>
    )

  return (
    <div className="mt-4 space-y-3 border-t border-ui-border pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ui-muted">Navigation</p>
      <SelectField
        label="Navigation placement"
        value={navigation.placement}
        onChange={(placement) => apply(setNavPlacement(placement as NavPlacement))}
        options={NAV_PLACEMENTS.map((value) => ({ value, label: PLACEMENT_LABELS[value] }))}
      />
      {group('Primary', navigation.primaryItems)}
      {group('Secondary', navigation.secondaryItems)}
      {navigation.primaryItems.length + navigation.secondaryItems.length === 0 && (
        <p className="text-sm text-ui-muted">This workspace has no navigation items.</p>
      )}
    </div>
  )
}
