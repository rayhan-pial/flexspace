import { useState } from 'react'
import { setTheme } from '../../domain/workspace/commands'
import { FONT_FAMILIES } from '../../domain/workspace/constants'
import type { FontFamily, Theme } from '../../domain/workspace/types'
import { ColorField, IntegerField, SelectField } from '../../shared/ui/fields'
import { FONT_LABELS } from '../workspace/theme'
import { useEditorStore } from './editorStore'

/** Workspace-wide colours, font family and base size. Each change updates the draft (and canvas) live. */
export default function ThemePanel() {
  const theme = useEditorStore((s) => s.draftConfig?.theme)
  const apply = useEditorStore((s) => s.apply)
  const [error, setError] = useState<string | null>(null)
  if (!theme) return null

  function change(patch: Partial<Theme>) {
    const outcome = apply(setTheme(patch))
    setError(outcome.status === 'rejected' ? outcome.error : null)
  }

  return (
    <div className="space-y-4">
      <ColorField label="Primary color" value={theme.primary} onChange={(primary) => change({ primary })} />
      <ColorField label="Page background" value={theme.background} onChange={(background) => change({ background })} />
      <ColorField label="Card background" value={theme.surface} onChange={(surface) => change({ surface })} />
      <ColorField label="Text color" value={theme.text} onChange={(text) => change({ text })} />
      <SelectField
        label="Font family"
        value={theme.fontFamily}
        onChange={(fontFamily) => change({ fontFamily: fontFamily as FontFamily })}
        options={FONT_FAMILIES.map((family) => ({ value: family, label: FONT_LABELS[family] }))}
      />
      <IntegerField label="Base font size (px)" value={theme.fontSizePx} min={12} max={20} onChange={(fontSizePx) => change({ fontSizePx })} />
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>}
    </div>
  )
}
