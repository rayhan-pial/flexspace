import { useId, useState } from 'react'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import { useSessionStore } from '../auth/sessionStore'
import { setWorkspaceTitle } from '../../domain/workspace/commands'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import SaveBar from '../editor/SaveBar'
import WorkspaceView from './WorkspaceView'
import { useUnsavedChangesGuard } from '../editor/useUnsavedChangesGuard'

/**
 * Protected workspace shell: header, save bar, workspace title, and the registry-rendered
 * sections. Selection, outline and properties panels join in FS-012 onward.
 */
export default function WorkspaceGate() {
  const user = useSessionStore((s) => s.user)
  const workspace = useSessionStore((s) => s.workspace)
  const loadWorkspace = useSessionStore((s) => s.loadWorkspace)
  const logout = useSessionStore((s) => s.logout)
  const draft = useEditorStore((s) => s.draftConfig)
  const revision = useEditorStore((s) => s.revision)
  const apply = useEditorStore((s) => s.apply)
  const dirty = useEditorStore(selectIsDirty)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  const titleId = useId()

  useUnsavedChangesGuard()

  function onTitleChange(value: string) {
    const outcome = apply(setWorkspaceTitle(value))
    setTitleError(outcome.status === 'rejected' ? outcome.error : null)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <span className="font-semibold tracking-tight text-slate-900">FlexSpace</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-600" data-testid="current-user">{user?.email}</span>
          <button
            type="button"
            onClick={() => (dirty ? setConfirmLogout(true) : void logout())}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Log out
          </button>
        </div>
      </header>

      {workspace.status === 'ready' && draft && <SaveBar />}

      <main className="mx-auto max-w-6xl p-6">
        {(workspace.status === 'idle' || workspace.status === 'loading') && (
          <p role="status" className="text-slate-600">Loading your workspace…</p>
        )}

        {workspace.status === 'error' && (
          <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-900 ring-1 ring-rose-200">
            <p className="font-medium">{workspace.message}</p>
            {workspace.code !== 'unsupported_schema_version' && workspace.code !== 'invalid_config' && (
              <button
                type="button"
                onClick={() => void loadWorkspace()}
                className="mt-3 rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {workspace.status === 'ready' && draft && (
          <section aria-labelledby="workspace-title" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h1 id="workspace-title" className="text-2xl font-semibold tracking-tight text-slate-900">
              {draft.title || 'Untitled workspace'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Saved revision {revision}</p>

            <label htmlFor={titleId} className="mt-5 block text-sm font-medium text-slate-700">Workspace title</label>
            <input
              id={titleId}
              type="text"
              maxLength={120}
              value={draft.title}
              onChange={(e) => onTitleChange(e.target.value)}
              aria-invalid={titleError ? true : undefined}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            {titleError && <p role="alert" className="mt-1 text-sm text-rose-700">{titleError}</p>}

          </section>
        )}

        {workspace.status === 'ready' && draft && <WorkspaceView />}
      </main>

      {confirmLogout && (
        <ConfirmDialog
          destructive
          title="Log out and discard changes?"
          message="You have unsaved changes. Logging out will discard them."
          confirmLabel="Discard and log out"
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => {
            setConfirmLogout(false)
            void logout()
          }}
        />
      )}
    </div>
  )
}
