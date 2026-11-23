import { useId, useState } from 'react'
import { setWorkspaceTitle } from '../../domain/workspace/commands'
import { useEditorStore } from '../editor/editorStore'
import { LeftPanel, RightPanel } from '../editor/EditorPanels'
import EditorToolbar from '../editor/EditorToolbar'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import WorkspaceView from './WorkspaceView'

/**
 * The editing surface: toolbar, builder panels (Edit on desktop only) and the canvas. In Preview,
 * or below desktop width, only the canvas is shown: builder panels and handles are gone.
 */
export default function EditorShell() {
  const draft = useEditorStore((s) => s.draftConfig)
  const revision = useEditorStore((s) => s.revision)
  const apply = useEditorStore((s) => s.apply)
  const mode = useEffectiveMode()
  const [titleError, setTitleError] = useState<string | null>(null)
  const titleId = useId()
  if (!draft) return null

  const editing = mode === 'edit'

  function onTitleChange(value: string) {
    const outcome = apply(setWorkspaceTitle(value))
    setTitleError(outcome.status === 'rejected' ? outcome.error : null)
  }

  return (
    <>
      <EditorToolbar />
      <div className={`mx-auto max-w-[1600px] gap-6 p-6 ${editing ? 'grid lg:grid-cols-[16rem_minmax(0,1fr)_18rem]' : 'block'}`}>
        {editing && <LeftPanel />}

        <main className="min-w-0">
          <section aria-labelledby="workspace-title" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h1 id="workspace-title" className="text-2xl font-semibold tracking-tight text-slate-900">
              {draft.title || 'Untitled workspace'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Saved revision {revision}</p>

            {editing && (
              <>
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
              </>
            )}
          </section>

          <WorkspaceView />
        </main>

        {editing && <RightPanel />}
      </div>
    </>
  )
}
