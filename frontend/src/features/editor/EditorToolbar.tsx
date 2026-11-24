import { useState } from 'react'
import Button from '../../shared/ui/Button'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import StatusBadge from '../../shared/ui/StatusBadge'
import { selectCanRedo, selectCanUndo, selectIsDirty, useEditorStore } from './editorStore'
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
  const canUndo = useEditorStore(selectCanUndo)
  const canRedo = useEditorStore(selectCanRedo)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const historyNote = useEditorStore((s) => s.history.note)
  const isDesktop = useIsDesktop()
  const mode = useEffectiveMode()

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
  if (saving) status = 'Saving…'
  else if (dirty && mode === 'edit') status = 'Unsaved changes'
  else if (dirty && isDesktop) status = 'Unsaved changes. Switch to Edit to save or cancel them.'
  else if (dirty) status = 'Unsaved changes. Open this workspace on a larger screen to save or cancel them.'

  return (
    <div className="border-b border-ui-border bg-ui-surface px-4 py-2 sm:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
        <p role="status" aria-label="Save status" aria-live="polite">
          <StatusBadge tone={saving ? 'neutral' : dirty ? 'warning' : 'success'}>{status}</StatusBadge>
        </p>
        <p role="status" aria-label="History status" aria-live="polite" className="sr-only">{historyNote}</p>

        <div className="flex flex-wrap items-center gap-2">
          {isDesktop && mode === 'edit' && (
            <>
              <Button disabled={!canUndo} onClick={() => undo()} title="Undo (Ctrl+Z)">Undo</Button>
              <Button disabled={!canRedo} onClick={() => redo()} title="Redo (Ctrl+Shift+Z)">Redo</Button>
              <Button onClick={() => setMode('preview')}>Preview</Button>
              <Button disabled={!dirty || saving} onClick={() => setConfirm('cancel')}>Cancel</Button>
              <Button variant="primary" disabled={!dirty || saving} onClick={() => void saveDraft()}>Save</Button>
            </>
          )}
          {isDesktop && mode === 'preview' && (
            <Button variant="primary" onClick={() => setMode('edit')}>Edit workspace</Button>
          )}
        </div>
      </div>

      {!isDesktop && (
        <p role="note" className="mx-auto mt-2 max-w-[1600px] rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Editing layout and properties needs a screen at least 1024 px wide. You are viewing your workspace in preview, and you can still
          read it and use its notes.
        </p>
      )}

      {saveStatus.state === 'error' && !conflict && saveStatus.kind !== 'unauthenticated' && (
        <div role="alert" className="mx-auto mt-2 flex max-w-[1600px] items-start justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">
          <span>{saveStatus.message}</span>
          <button type="button" onClick={dismissSaveError} className="ui-focus shrink-0 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {conflict && (
        <div role="alert" className="mx-auto mt-2 max-w-[1600px] rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">{conflict.message}</p>
          <p className="mt-1">
            The saved workspace is now at revision {conflict.currentRevision}. Your changes were not saved and are still here.
          </p>
          <div className="mt-2 flex gap-2">
            <Button onClick={dismissSaveError}>Keep editing</Button>
            <Button variant="primary" disabled={saving} onClick={() => (dirty ? setConfirm('reload') : void reload())}>
              Reload latest
            </Button>
          </div>
        </div>
      )}

      {reloadError && (
        <p role="alert" className="mx-auto mt-2 max-w-[1600px] rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">
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
