import { useState } from 'react'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import { selectIsDirty, useEditorStore } from './editorStore'
import { useEffectiveMode, useIsDesktop } from './useEffectiveMode'
import { reloadLatest, saveDraft } from './workspaceSync'

const button =
  'rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50'

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
    <div className="border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
        <p role="status" aria-label="Save status" aria-live="polite" className={`text-sm ${dirty && !saving ? 'font-medium text-amber-700' : 'text-slate-600'}`}>
          {status}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {isDesktop && mode === 'edit' && (
            <>
              <button type="button" onClick={() => setMode('preview')} className={`${button} border border-slate-300 text-slate-700 hover:bg-slate-100`}>
                Preview
              </button>
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => setConfirm('cancel')}
                className={`${button} border border-slate-300 text-slate-700 hover:bg-slate-100`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => void saveDraft()}
                className={`${button} bg-indigo-600 text-white hover:bg-indigo-500`}
              >
                Save
              </button>
            </>
          )}
          {isDesktop && mode === 'preview' && (
            <button type="button" onClick={() => setMode('edit')} className={`${button} bg-indigo-600 text-white hover:bg-indigo-500`}>
              Edit workspace
            </button>
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
          <button type="button" onClick={dismissSaveError} className="shrink-0 font-medium underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
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
            <button type="button" onClick={dismissSaveError} className={`${button} border border-amber-300 bg-white text-amber-900 hover:bg-amber-100`}>
              Keep editing
            </button>
            <button type="button" disabled={saving} onClick={() => (dirty ? setConfirm('reload') : void reload())} className={`${button} bg-amber-700 text-white hover:bg-amber-600`}>
              Reload latest
            </button>
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
