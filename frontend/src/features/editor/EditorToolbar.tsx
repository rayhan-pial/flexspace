import { useId, useState } from 'react'
import { useInspectorView } from './inspectorView'
import { setWorkspaceTitle } from '../../domain/workspace/commands'
import Button from '../../shared/ui/Button'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import StatusBadge from '../../shared/ui/StatusBadge'
import { cancelBlocker, historyBlocker, saveBlocker, selectIsDirty, useEditorStore } from './editorStore'
import { useEffectiveMode, useIsDesktop } from './useEffectiveMode'
import { reloadLatest, saveDraft } from './workspaceSync'

/**
 * Editor toolbar: mode switch, dirty/saving status, and (in Edit) explicit Save and Cancel.
 * Preview keeps an "Edit workspace" entry point and tells the user where to Save or Cancel.
 * Below desktop width editing is unavailable: the page is a Preview with an explanation.
 * Switching modes only changes how the same draft is presented; nothing is sent or discarded.
 */
export default function EditorToolbar() {
  const dirty = useEditorStore(selectIsDirty)
  const saveStatus = useEditorStore((s) => s.saveStatus)
  const cancel = useEditorStore((s) => s.cancel)
  const setMode = useEditorStore((s) => s.setMode)
  const dismissSaveError = useEditorStore((s) => s.dismissSaveError)
  const undoBlocker = useEditorStore((s) => historyBlocker(s, 'undo'))
  const redoBlocker = useEditorStore((s) => historyBlocker(s, 'redo'))
  const saveBlock = useEditorStore(saveBlocker)
  const cancelBlock = useEditorStore(cancelBlocker)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const historyNote = useEditorStore((s) => s.history.note)
  const title = useEditorStore((s) => s.draftConfig?.title)
  const revision = useEditorStore((s) => s.revision)
  const apply = useEditorStore((s) => s.apply)
  const reloading = useEditorStore((s) => s.reloading)
  const isDesktop = useIsDesktop()
  const { openLibrary, openTemplates, inspectorOpen, setInspectorOpen } = useInspectorView()
  const gesture = useEditorStore((s) => s.interaction.gesture)
  const editBlock = useEditorStore((s) => (s.frozen ? 'Sign in again to keep editing.' : s.reloading ? 'The latest saved workspace is loading.' : null))
  const mode = useEffectiveMode()
  const titleId = useId()
  const [titleError, setTitleError] = useState<string | null>(null)

  function onTitleChange(value: string) {
    const outcome = apply(setWorkspaceTitle(value))
    setTitleError(outcome.status === 'rejected' ? outcome.error : null)
  }

  const [confirm, setConfirm] = useState<'cancel' | 'reload' | null>(null)
  const [reloadError, setReloadError] = useState<string | null>(null)

  const saving = saveStatus.state === 'saving'
  const conflict = saveStatus.state === 'error' && saveStatus.kind === 'conflict' ? saveStatus : null

  async function reload() {
    setConfirm(null)
    const result = await reloadLatest()
    setReloadError(result.ok ? null : result.message)
  }

  let status = 'All changes saved'
  if (reloading) status = 'Reloading the latest saved workspace… editing is paused'
  else if (saving) status = 'Saving…'
  else if (dirty && mode === 'edit') status = 'Unsaved changes'
  else if (dirty && isDesktop) status = 'Unsaved changes. Switch to Edit to save or cancel them.'
  else if (dirty) status = 'Unsaved changes. Open this workspace on a larger screen to save or cancel them.'

  return (
    <div data-toolbar className="border-b border-ui-border bg-ui-surface px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 id="workspace-title" className="truncate text-xl font-semibold tracking-tight text-ui-text">{title || 'Untitled workspace'}</h1>
          <p className="text-xs text-ui-muted">Saved revision {revision}</p>
        </div>

        {isDesktop && mode === 'edit' && (
          <div className="min-w-48 flex-1 sm:max-w-xs">
            <label htmlFor={titleId} className="block text-xs font-medium text-ui-muted">Workspace title</label>
            <input
              id={titleId}
              type="text"
              maxLength={120}
              value={title ?? ''}
              disabled={reloading}
              onChange={(e) => onTitleChange(e.target.value)}
              aria-invalid={titleError ? true : undefined}
              className="ui-focus block w-full rounded-ui-control border border-ui-control bg-ui-surface px-3 py-1.5 text-sm text-ui-text focus:border-ui-primary aria-[invalid=true]:border-ui-danger [@media(pointer:coarse)]:min-h-11"
            />
          </div>
        )}

        <p role="status" aria-label="Save status" aria-live="polite" className="ml-auto">
          <StatusBadge tone={saving || reloading ? 'neutral' : dirty ? 'warning' : 'success'}>{status}</StatusBadge>
        </p>
        <p role="status" aria-label="History status" aria-live="polite" className="sr-only">{historyNote}</p>

        <div className="flex flex-wrap items-center gap-2">
          {isDesktop && mode === 'edit' && (
            <>
              <Button reason={editBlock} aria-haspopup="dialog" onClick={openLibrary}>Add component</Button>
              <Button reason={editBlock} aria-haspopup="dialog" onClick={openTemplates}>Templates</Button>
              <Button reason={undoBlocker} onClick={() => undo()} title="Undo (Ctrl+Z)">Undo</Button>
              <Button reason={redoBlocker} onClick={() => redo()} title="Redo (Ctrl+Shift+Z)">Redo</Button>
              <Button
                aria-expanded={inspectorOpen}
                reason={gesture ? 'Finish the drag or resize first.' : null}
                onClick={() => setInspectorOpen(!inspectorOpen)}
              >
                {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
              </Button>
              <Button onClick={() => setMode('preview')}>Preview</Button>
              <Button reason={cancelBlock} onClick={() => setConfirm('cancel')}>Cancel</Button>
              <Button variant="primary" reason={saveBlock} onClick={() => void saveDraft()}>Save</Button>
            </>
          )}
          {isDesktop && mode === 'preview' && (
            <Button variant="primary" onClick={() => setMode('edit')}>Edit workspace</Button>
          )}
        </div>
      </div>

      {titleError && <p role="alert" className="mt-2 text-sm font-medium text-ui-danger">{titleError}</p>}

      {!isDesktop && (
        <p role="note" className="mt-2 rounded-ui-control bg-ui-subtle px-3 py-2 text-sm text-ui-text">
          Editing layout and properties needs a screen at least 1024 px wide. You are viewing your workspace in preview. You can still tick
          tasks and type in notes here, but those changes stay in this browser tab until you open the workspace on a wider screen and press Save.
        </p>
      )}

      {saveStatus.state === 'error' && !conflict && saveStatus.kind !== 'unauthenticated' && (
        <div role="alert" className="mt-2 flex items-start justify-between gap-3 rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
          <span>{saveStatus.message}</span>
          <button type="button" onClick={dismissSaveError} className="ui-focus shrink-0 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {conflict && (
        <div role="alert" className="mt-2 rounded-ui-control bg-amber-50 px-3 py-2 text-sm text-ui-warning ring-1 ring-amber-200">
          <p className="font-medium">{conflict.message}</p>
          <p className="mt-1">
            The saved workspace is now at revision {conflict.currentRevision}. Your changes were not saved and are still here.
          </p>
          <div className="mt-2 flex gap-2">
            <Button onClick={dismissSaveError}>Keep editing</Button>
            <Button variant="primary" disabled={saving || reloading} onClick={() => (dirty ? setConfirm('reload') : void reload())}>
              Reload latest
            </Button>
          </div>
        </div>
      )}

      {reloadError && (
        <p role="alert" className="mt-2 rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
          {reloadError}
        </p>
      )}

      {confirm === 'cancel' && (
        <ConfirmDialog
          destructive
          title="Discard unsaved changes?"
          message="Your workspace goes back to the last saved version."
          confirmLabel="Discard changes"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            cancel()
          }}
        />
      )}
      {confirm === 'reload' && (
        <ConfirmDialog
          destructive
          title="Discard your changes and reload?"
          message="Your unsaved changes will be replaced by the latest saved workspace."
          confirmLabel="Discard and reload"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void reload()}
        />
      )}
    </div>
  )
}
