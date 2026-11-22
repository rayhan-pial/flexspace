import { useSessionStore } from '../auth/sessionStore'
import { useEditorStore } from '../editor/editorStore'

/**
 * Protected workspace loading (FS-008). It proves the signed-in user's own saved workspace
 * arrives and shows loading/error states; the registry renderer replaces the body in FS-011.
 */
export default function WorkspaceGate() {
  const user = useSessionStore((s) => s.user)
  const workspace = useSessionStore((s) => s.workspace)
  const loadWorkspace = useSessionStore((s) => s.loadWorkspace)
  const logout = useSessionStore((s) => s.logout)
  const draft = useEditorStore((s) => s.draftConfig)
  const revision = useEditorStore((s) => s.revision)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <span className="font-semibold tracking-tight text-slate-900">FlexSpace</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-600" data-testid="current-user">{user?.email}</span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Log out
          </button>
        </div>
      </header>

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

        {workspace.status === 'ready' && draft && (
          <section aria-labelledby="workspace-title" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h1 id="workspace-title" className="text-2xl font-semibold tracking-tight text-slate-900">
              {draft.title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Saved revision {revision}</p>
            <ul className="mt-4 divide-y divide-slate-100">
              {draft.sections.map((section) => (
                <li key={section.id} className="flex justify-between py-2 text-sm">
                  <span className="text-slate-800">{section.title || 'Untitled section'}</span>
                  <span className="text-slate-500">
                    {section.widgets.length} widget{section.widgets.length === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
