import { useState } from 'react'
import { setTheme } from '../../domain/workspace/commands'
import { FONT_FAMILIES } from '../../domain/workspace/constants'
import type { FontFamily, Theme } from '../../domain/workspace/types'
import { ColorField, IntegerField, SelectField } from '../../shared/ui/fields'
import Group from '../../shared/ui/Group'
import { contrastRatio, themeContrastChecks } from '../workspace/contrast'
import { FONT_LABELS, FONT_STACKS } from '../workspace/theme'
import { useEditorStore } from './editorStore'
import { SUGGESTED_PALETTES } from './themePalettes'

const HEX = /^#[0-9a-fA-F]{6}$/
const safe = (value: string, fallback: string) => (HEX.test(value) ? value : fallback)

/**
 * Workspace-wide colours, font family and base size. Each change updates the draft (and canvas)
 * live through the existing theme command, so Save, Cancel and Undo work as for any other edit.
 * The sample below draws from the draft theme directly; the editor's own colours never change.
 */
export default function ThemePanel() {
  const theme = useEditorStore((s) => s.draftConfig?.theme)
  const apply = useEditorStore((s) => s.apply)
  const [error, setError] = useState<string | null>(null)
  if (!theme) return null

  function change(patch: Partial<Theme>) {
    const outcome = apply(setTheme(patch))
    setError(outcome.status === 'rejected' ? outcome.error : null)
  }

  const checks = themeContrastChecks(theme)
  const weak = checks.filter((check) => !check.ok)
  // Text on the sample accent: whichever of white or black reads better on the chosen color.
  const accent = safe(theme.primary, '#6366f1')
  const onPrimary = (contrastRatio('#ffffff', accent) ?? 0) >= (contrastRatio('#000000', accent) ?? 0) ? '#ffffff' : '#000000'
  const stack = Object.hasOwn(FONT_STACKS, theme.fontFamily) ? FONT_STACKS[theme.fontFamily] : FONT_STACKS.system

  return (
    <div>
      <div
        aria-label="Theme sample"
        role="group"
        className="rounded-ui-control p-3 ring-1 ring-ui-control"
        style={{ backgroundColor: safe(theme.background, '#f8fafc'), color: safe(theme.text, '#0f172a'), fontFamily: stack }}
      >
        <div className="rounded-ui-control p-3" style={{ backgroundColor: safe(theme.surface, '#ffffff') }}>
          <p className="text-sm font-semibold">Sample card</p>
          <p className="mt-0.5 text-xs">Text uses your text color and font.</p>
          <span className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: safe(theme.primary, '#6366f1'), color: onPrimary }}>
            Primary accent
          </span>
        </div>
      </div>

      <Group title="Suggested palettes">
        <ul aria-label="Suggested palettes" className="grid gap-2 min-[1280px]:grid-cols-2">
          {SUGGESTED_PALETTES.map(({ name, colors }) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => change(colors)}
                aria-label={`Use ${name} palette`}
                className="ui-focus flex w-full min-w-0 items-center gap-2 rounded-ui-control bg-ui-surface px-2 py-2 text-left text-sm font-medium text-ui-text ring-1 ring-ui-control hover:bg-ui-subtle [@media(pointer:coarse)]:min-h-11"
              >
                <span aria-hidden="true" className="flex shrink-0 -space-x-1">
                  {[colors.primary, colors.background, colors.text].map((color, index) => (
                    <span key={index} className="size-3.5 rounded-full ring-1 ring-ui-control" style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="min-w-0 truncate">{name}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ui-muted">Sets the four colors below. You can still change each one.</p>
      </Group>

      <Group title="Colors">
        <ColorField label="Primary color" hint="Buttons, links and highlights." value={theme.primary} onChange={(primary) => change({ primary })} />
        <ColorField label="Page background" hint="Behind all sections." value={theme.background} onChange={(background) => change({ background })} />
        <ColorField label="Card background" hint="Widgets and cards." value={theme.surface} onChange={(surface) => change({ surface })} />
        <ColorField label="Text color" hint="Headings and body text." value={theme.text} onChange={(text) => change({ text })} />
        <div aria-label="Contrast" role="group">
          <ul className="space-y-1 text-xs">
            {checks.map((check) => (
              <li key={check.label} className={check.ok ? 'text-ui-success' : 'font-medium text-ui-warning'}>
                {check.label}: {(Math.floor(check.ratio * 10) / 10).toFixed(1)}:1 {check.ok ? 'is readable.' : `is low (aim for ${check.required}:1 or more).`}
              </li>
            ))}
          </ul>
          {weak.length > 0 && <p role="status" className="mt-2 text-xs text-ui-muted">This is a suggestion only. Your colors are kept as you set them.</p>}
        </div>
      </Group>

      <Group title="Typography">
        <SelectField
          label="Font family"
          value={theme.fontFamily}
          onChange={(fontFamily) => change({ fontFamily: fontFamily as FontFamily })}
          options={FONT_FAMILIES.map((family) => ({ value: family, label: FONT_LABELS[family] }))}
        />
        <IntegerField label="Base font size (px)" value={theme.fontSizePx} min={12} max={20} onChange={(fontSizePx) => change({ fontSizePx })} />
      </Group>

      {error && <p role="alert" className="mt-4 rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">{error}</p>}
    </div>
  )
}
