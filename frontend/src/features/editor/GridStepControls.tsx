import { useState } from 'react'
import { nudgeWidget } from '../../domain/workspace/grid'
import type { RectChange } from '../../domain/workspace/grid'
import Button from '../../shared/ui/Button'
import { useEditorStore } from './editorStore'

const STEPS: Array<{ legend: string; buttons: Array<{ label: string; change: RectChange }> }> = [
  {
    legend: 'Position',
    buttons: [
      { label: 'Left', change: { dx: -1 } },
      { label: 'Right', change: { dx: 1 } },
      { label: 'Up', change: { dy: -1 } },
      { label: 'Down', change: { dy: 1 } },
    ],
  },
  {
    legend: 'Size',
    buttons: [
      { label: 'Narrower', change: { dw: -1 } },
      { label: 'Wider', change: { dw: 1 } },
      { label: 'Shorter', change: { dh: -1 } },
      { label: 'Taller', change: { dh: 1 } },
    ],
  },
]

/**
 * Click alternatives to dragging and to the handle's arrow keys. Each button is one step of the
 * existing `nudgeWidget` command, so a refusal (outside the grid, too small, another widget in the
 * way) leaves the draft unchanged and is shown right here.
 */
export default function GridStepControls({ widgetId, title }: { widgetId: string; title: string }) {
  const apply = useEditorStore((s) => s.apply)
  const [message, setMessage] = useState<string | null>(null)

  function step(change: RectChange) {
    const outcome = apply(nudgeWidget(widgetId, change))
    setMessage(outcome.status === 'rejected' ? outcome.error : null)
  }

  return (
    <div className="space-y-3">
      {STEPS.map(({ legend, buttons }) => (
        <fieldset key={legend} className="space-y-1.5">
          <legend className="text-xs font-medium text-ui-muted">{legend}</legend>
          <div className="flex flex-wrap gap-1.5">
            {buttons.map(({ label, change }) => (
              <Button key={label} onClick={() => step(change)} aria-label={`${legend === 'Size' ? 'Make' : 'Move'} ${title} ${label.toLowerCase()}`}>
                {label}
              </Button>
            ))}
          </div>
        </fieldset>
      ))}
      {message && <p role="alert" className="rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">{message}</p>}
    </div>
  )
}
