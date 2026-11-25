import { useId, useState } from 'react'
import { MAX_LABEL } from '../../domain/workspace/constants'
import {
  removeSection, removeWidget, setSectionHidden, setSectionTitle, setWidgetHidden,
} from '../../domain/workspace/lifecycle'
import type { Section, Widget } from '../../domain/workspace/types'
import Button from '../../shared/ui/Button'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import Group from '../../shared/ui/Group'
import GridStepControls from './GridStepControls'
import MoveButtons from '../sorting/MoveButtons'
import { outlineContainerId, SECTIONS_ROOT, stackContainerId, workspaceAdapter } from '../sorting/workspaceAdapter'
import { isKnownWidgetType } from '../workspace/registry'
import { useEditorStore } from './editorStore'

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
    <p role="alert" className="mt-3 rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
      {message}
    </p>
  ) : null
}

/** Hide/show and remove for the selected widget. Remove asks first because it deletes its content. */
export function WidgetActions({ widget, section, sections }: { widget: Widget; section: Section; sections: Section[] }) {
  const { error, run } = useRun()
  const [confirming, setConfirming] = useState(false)
  const rect = section.kind === 'grid' ? section.layout?.find((item) => item.i === widget.id) : undefined
  return (
    <>
      <Group title="Layout">
        {rect && (
          <p aria-live="polite" className="text-sm text-ui-text">
            Column {rect.x + 1}, row {rect.y + 1}, {rect.w} columns wide, {rect.h} rows tall.
            <span className="mt-1 block text-xs text-ui-muted">Drag the widget by its handle, or focus the handle and use the arrow keys to move and Shift with the arrow keys to resize.</span>
          </p>
        )}
        {rect && <GridStepControls widgetId={widget.id} title={widget.title || 'widget'} />}
        {section.kind === 'grid' && (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-ui-muted">Order</legend>
            <MoveButtons adapter={workspaceAdapter} itemId={widget.id} containerId={outlineContainerId(section.id)} otherContainers={[]} />
            <p className="text-xs text-ui-muted">Changing the order repacks the visible widgets of this section in that order.</p>
          </fieldset>
        )}
        {section.kind === 'stack' && (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-ui-muted">Order</legend>
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
      </Group>
      <Group title="Visibility">
        <p className="text-sm text-ui-text">{widget.hidden ? 'Hidden from the workspace. It stays in the outline.' : 'Visible in the workspace.'}</p>
        <Button onClick={() => run(setWidgetHidden(widget.id, !widget.hidden))}>
          {widget.hidden ? 'Show widget' : 'Hide widget'}
        </Button>
      </Group>
      <Group title="Actions">
        <Button variant="destructive" onClick={() => setConfirming(true)}>Remove widget</Button>
      </Group>
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
    </>
  )
}

/** Rename, hide/show and remove for the selected section. */
export function SectionActions({ section }: { section: Section }) {
  const { error, run } = useRun()
  const [confirming, setConfirming] = useState(false)
  const titleId = useId()
  return (
    <>
      <Group title="Content">
        <div>
          <label htmlFor={titleId} className="block text-sm font-medium text-ui-text">
            Section title
          </label>
          <input
            id={titleId}
            type="text"
            value={section.title}
            maxLength={MAX_LABEL}
            onChange={(event) => run(setSectionTitle(section.id, event.target.value))}
            className="ui-focus mt-1 block w-full rounded-ui-control border border-ui-control bg-ui-surface px-3 py-1.5 text-sm text-ui-text focus:border-ui-primary"
          />
        </div>
      </Group>
      <Group title="Layout">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-ui-muted">Order</legend>
          <MoveButtons adapter={workspaceAdapter} itemId={section.id} containerId={SECTIONS_ROOT} otherContainers={[]} />
        </fieldset>
      </Group>
      <Group title="Visibility">
        <p className="text-sm text-ui-text">{section.hidden ? 'Hidden from the workspace. It stays in the outline.' : 'Visible in the workspace.'}</p>
        <Button onClick={() => run(setSectionHidden(section.id, !section.hidden))}>
          {section.hidden ? 'Show section' : 'Hide section'}
        </Button>
      </Group>
      <Group title="Actions">
        <Button variant="destructive" onClick={() => setConfirming(true)}>Remove section</Button>
      </Group>
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
    </>
  )
}
