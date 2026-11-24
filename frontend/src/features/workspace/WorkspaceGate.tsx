import { useState } from 'react'
import Button from '../../shared/ui/Button'
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
    <div className="min-h-screen bg-ui-bg text-ui-text">
      <header className="flex items-center justify-between gap-3 border-b border-ui-border bg-ui-surface px-4 py-3 sm:px-6">
        <span className="shrink-0 text-lg font-semibold tracking-tight text-ui-text">FlexSpace</span>
        <div className="flex min-w-0 items-center gap-3 text-sm sm:gap-4">
          <span className="min-w-0 truncate text-ui-muted" title={user?.email} data-testid="current-user">{user?.email}</span>
          <Button className="shrink-0" onClick={() => (dirty ? setConfirmLogout(true) : void logout())}>Log out</Button>
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
