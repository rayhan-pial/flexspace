import { useSessionStore } from '../auth/sessionStore'
import { useEditorStore } from '../editor/editorStore'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import { useUnsavedChangesGuard } from '../editor/useUnsavedChangesGuard'
import { BrandMark } from '../../shared/ui/icons'
import AccountControls from './AccountControls'
import EditorShell from './EditorShell'

/**
 * Protected workspace page: load/error states and, once loaded, the editor shell. The account
 * header shows everywhere except desktop Edit, where the application rail carries the brand and account.
 */
export default function WorkspaceGate() {
  const workspace = useSessionStore((s) => s.workspace)
  const loadWorkspace = useSessionStore((s) => s.loadWorkspace)
  const hasDraft = useEditorStore((s) => s.draftConfig !== null)
  const mode = useEffectiveMode()
  const ready = workspace.status === 'ready' && hasDraft

  useUnsavedChangesGuard()

  return (
    <div className="min-h-screen bg-ui-bg text-ui-text">
      {!(ready && mode === 'edit') && (
        <header className="flex items-center justify-between gap-3 border-b border-ui-border bg-ui-surface px-4 py-3 sm:px-6">
          <span className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight text-ui-text">
            <BrandMark />
            FlexSpace
          </span>
          <AccountControls layout="header" />
        </header>
      )}

      {ready ? (
        <EditorShell />
      ) : (
        <main className="mx-auto max-w-3xl p-6">
          {(workspace.status === 'idle' || workspace.status === 'loading') && (
            <p role="status" className="text-ui-muted">Loading your workspace…</p>
          )}

          {workspace.status === 'error' && (
            <div role="alert" className="rounded-ui-card bg-red-50 p-4 text-red-900 ring-1 ring-red-200">
              <p className="font-medium">{workspace.message}</p>
              {workspace.code !== 'unsupported_schema_version' && workspace.code !== 'invalid_config' && (
                <button
                  type="button"
                  onClick={() => void loadWorkspace()}
                  className="ui-focus mt-3 rounded-ui-control bg-ui-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-ui-danger-hover"
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </main>
      )}
    </div>
  )
}
