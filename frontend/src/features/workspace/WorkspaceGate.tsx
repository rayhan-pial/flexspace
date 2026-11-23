import { useState } from 'react'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import { useUnsavedChangesGuard } from '../editor/useUnsavedChangesGuard'
import EditorShell from './EditorShell'

/**
 * Protected workspace page: header, load/error states, and (once loaded) the editor shell.
 */
export default function WorkspaceGate() {
  const user = useSessionStore((s) => s.user)
  const workspace = useSessionStore((s) => s.workspace)
  const loadWorkspace = useSessionStore((s) => s.loadWorkspace)
  const logout = useSessionStore((s) => s.logout)
  const hasDraft = useEditorStore((s) => s.draftConfig !== null)
  const dirty = useEditorStore(selectIsDirty)
  const [confirmLogout, setConfirmLogout] = useState(false)

  useUnsavedChangesGuard()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <span className="shrink-0 font-semibold tracking-tight text-slate-900">FlexSpace</span>
        <div className="flex min-w-0 items-center gap-3 text-sm sm:gap-4">
          <span className="min-w-0 truncate text-slate-600" title={user?.email} data-testid="current-user">{user?.email}</span>
          <button
            type="button"
            onClick={() => (dirty ? setConfirmLogout(true) : void logout())}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Log out
          </button>
        </div>
      </header>

      {workspace.status === 'ready' && hasDraft ? (
        <EditorShell />
      ) : (
        <main className="mx-auto max-w-3xl p-6">
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
        </main>
      )}

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
