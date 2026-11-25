import { useState } from 'react'
import { nudgeWidget, stepAvailability } from '../../domain/workspace/grid'
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
 * `nudgeWidget` command. Availability comes from the same planner (`stepAvailability`, no side
 * effects), so a step that cannot run is natively disabled with its reason before it is clicked.
 * Stepping onto a neighbour is allowed: the neighbour is pushed down. Activation re-checks through
 * `apply`, so a stale or invalid command still changes nothing.
 */
export default function GridStepControls({ widgetId, title }: { widgetId: string; title: string }) {
  const apply = useEditorStore((s) => s.apply)
  const draft = useEditorStore((s) => s.draftConfig)
  const paused = useEditorStore((s) => (s.frozen ? 'Sign in again to keep editing.' : s.reloading ? 'The latest saved workspace is loading.' : s.interaction.gesture ? 'Finish the drag or resize first.' : null))
  const [message, setMessage] = useState<string | null>(null)
  const reasonFor = (change: RectChange) => paused ?? (draft ? stepAvailability(draft, widgetId, change).reason : 'No workspace is loaded.')
  const unavailable = STEPS.flatMap(({ buttons }) => buttons)
    .map(({ label, change }) => ({ label, reason: reasonFor(change) }))
    .filter((entry): entry is { label: string; reason: string } => entry.reason !== null)

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
              <Button key={label} reason={reasonFor(change)} onClick={() => step(change)} aria-label={`${legend === 'Size' ? 'Make' : 'Move'} ${title} ${label.toLowerCase()}`}>
                {label}
              </Button>
            ))}
          </div>
        </fieldset>
      ))}
      {unavailable.length > 0 && !paused && (
        <p className="text-xs text-ui-muted" data-testid="step-reasons">
          Unavailable now: {unavailable.map((entry) => `${entry.label} (${entry.reason.replace(/\.$/, '').toLowerCase()})`).join('; ')}.
        </p>
      )}
      {message && <p role="alert" className="rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">{message}</p>}
    </div>
  )
}
