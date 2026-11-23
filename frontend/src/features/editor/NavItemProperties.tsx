import { useState } from 'react'
import { ICONS, MAX_LABEL } from '../../domain/workspace/constants'
import { updateNavItem } from '../../domain/workspace/navigation'
import type { NavItemPatch } from '../../domain/workspace/navigation'
import type { IconName, NavItem, WorkspaceConfig } from '../../domain/workspace/types'
import { SelectField, TextField } from '../../shared/ui/fields'
import { ICON_LABELS } from '../workspace/navIcons'
import { useEditorStore } from './editorStore'

/** Label, target section and icon of the selected navigation item. */
export default function NavItemProperties({ item, config }: { item: NavItem; config: WorkspaceConfig }) {
  const apply = useEditorStore((s) => s.apply)
  const [error, setError] = useState<string | null>(null)

  function change(patch: NavItemPatch) {
    const outcome = apply(updateNavItem(item.id, patch))
    setError(outcome.status === 'rejected' ? outcome.error : null)
  }

  const NONE = ''
  return (
    <div className="mt-4 space-y-4 border-t border-slate-200 pt-3">
      <TextField label="Label" value={item.label} maxLength={MAX_LABEL} onChange={(label) => change({ label })} />
      <SelectField
        label="Goes to"
        value={item.targetSectionId ?? NONE}
        onChange={(value) => change({ targetSectionId: value === NONE ? null : value })}
        options={[
          { value: NONE, label: 'Nothing' },
          ...config.sections.map((s) => ({ value: s.id, label: s.title || 'Untitled section' })),
        ]}
      />
      <SelectField
        label="Icon"
        value={item.icon}
        onChange={(icon) => change({ icon: icon as IconName })}
        options={ICONS.map((value) => ({ value, label: ICON_LABELS[value] }))}
      />
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>}
    </div>
  )
}
