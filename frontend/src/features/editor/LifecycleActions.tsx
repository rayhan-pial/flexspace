import { useId, useState } from 'react'
import { MAX_LABEL } from '../../domain/workspace/constants'
import {
  removeSection, removeWidget, setSectionHidden, setSectionTitle, setWidgetHidden,
} from '../../domain/workspace/lifecycle'
import type { Section, Widget } from '../../domain/workspace/types'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import MoveButtons from '../sorting/MoveButtons'
import { SECTIONS_ROOT, stackContainerId, workspaceAdapter } from '../sorting/workspaceAdapter'
import { isKnownWidgetType } from '../workspace/registry'
import { useEditorStore } from './editorStore'

const button =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'
const danger =
  'rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500'

function useRun() {
  const apply = useEditorStore((s) => s.apply)
  const [error, setError] = useState<string | null>(null)
  return {
    error,
    run(command: Parameters<typeof apply>[0]) {
      const outcome = apply(command)
      setError(outcome.status === 'rejected' ? outcome.error : null)
    },
  }
}

function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">
      {message}
    </p>
  ) : null
}

/** Hide/show and remove for the selected widget. Remove asks first because it deletes its content. */
export function WidgetActions({ widget, section, sections }: { widget: Widget; section: Section; sections: Section[] }) {
  const { error, run } = useRun()
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => run(setWidgetHidden(widget.id, !widget.hidden))} className={button}>
          {widget.hidden ? 'Show widget' : 'Hide widget'}
        </button>
        <button type="button" onClick={() => setConfirming(true)} className={danger}>
          Remove widget
        </button>
      </div>
      {section.kind === 'stack' && (
        <fieldset className="mt-4 space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">Order</legend>
          <MoveButtons
            adapter={workspaceAdapter}
            itemId={widget.id}
            containerId={stackContainerId(section.id)}
            // Cards of unknown types stay in their section; known ones may move to any other stack section.
            otherContainers={
              isKnownWidgetType(widget.type)
                ? sections.filter((s) => s.kind === 'stack' && s.id !== section.id).map((s) => ({ id: stackContainerId(s.id), label: s.title || 'Untitled section' }))
                : []
            }
          />
        </fieldset>
      )}
      <ErrorLine message={error} />
      {confirming && (
        <ConfirmDialog
          destructive
          title="Remove this widget?"
          message="The widget and its content are removed from your draft. Cancel restores it until you save."
          confirmLabel="Remove widget"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            run(removeWidget(widget.id))
          }}
        />
      )}
    </div>
  )
}

/** Rename, hide/show and remove for the selected section. */
export function SectionActions({ section }: { section: Section }) {
  const { error, run } = useRun()
  const [confirming, setConfirming] = useState(false)
  const titleId = useId()
  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <label htmlFor={titleId} className="block text-sm font-medium text-slate-700">
        Section title
      </label>
      <input
        id={titleId}
        type="text"
        value={section.title}
        maxLength={MAX_LABEL}
        onChange={(event) => run(setSectionTitle(section.id, event.target.value))}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => run(setSectionHidden(section.id, !section.hidden))} className={button}>
          {section.hidden ? 'Show section' : 'Hide section'}
        </button>
        <button type="button" onClick={() => setConfirming(true)} className={danger}>
          Remove section
        </button>
      </div>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">Order</legend>
        <MoveButtons adapter={workspaceAdapter} itemId={section.id} containerId={SECTIONS_ROOT} otherContainers={[]} />
      </fieldset>
      <ErrorLine message={error} />
      {confirming && (
        <ConfirmDialog
          destructive
          title="Remove this section?"
          message={`The section and its ${section.widgets.length} widget(s) are removed from your draft. Navigation items pointing to it will point to nothing. Cancel restores everything until you save.`}
          confirmLabel="Remove section"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            run(removeSection(section.id))
          }}
        />
      )}
    </div>
  )
}
