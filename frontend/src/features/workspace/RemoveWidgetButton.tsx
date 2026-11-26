import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { removeWidget } from '../../domain/workspace/lifecycle'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import { useEditorStore } from '../editor/editorStore'

/**
 * Remove a card straight from the canvas (Edit only). It asks first, exactly like the Remove widget
 * action in Properties, and the removal is one undoable draft change. The card stays draggable from
 * everywhere else; this is a button, so pressing it never starts a drag.
 */
export default function RemoveWidgetButton({ widgetId, title }: { widgetId: string; title: string }) {
  const apply = useEditorStore((s) => s.apply)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        aria-label={`Remove ${title}`}
        title="Remove"
        onClick={(event) => {
          event.stopPropagation()
          setError(null)
          setConfirming(true)
        }}
        className="ui-focus inline-flex min-h-6 min-w-6 items-center justify-center rounded p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
      {error && <span role="alert" className="sr-only">{error}</span>}
      {confirming && (
        <ConfirmDialog
          destructive
          title="Remove this widget?"
          message={`"${title}" and its content are removed from your draft. Undo or Cancel brings it back until you save.`}
          confirmLabel="Remove widget"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            const outcome = apply(removeWidget(widgetId))
            if (outcome.status === 'rejected') setError(outcome.error)
          }}
        />
      )}
    </>
  )
}
