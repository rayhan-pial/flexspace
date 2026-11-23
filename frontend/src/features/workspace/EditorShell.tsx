import { useId, useState } from 'react'
import { setWorkspaceTitle } from '../../domain/workspace/commands'
import { useEditorStore } from '../editor/editorStore'
import { LeftPanel, RightPanel } from '../editor/EditorPanels'
import EditorToolbar from '../editor/EditorToolbar'
import { useEditSessions, useHistoryShortcuts } from '../editor/useHistoryControls'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import SortProvider from '../sorting/SortProvider'
import { workspaceAdapter } from '../sorting/workspaceAdapter'
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
  useEditSessions()
  useHistoryShortcuts(mode === 'edit')
  if (!draft) return null

  const editing = mode === 'edit'

  function onTitleChange(value: string) {
    const outcome = apply(setWorkspaceTitle(value))
    setTitleError(outcome.status === 'rejected' ? outcome.error : null)
  }

  return (
    <>
      <EditorToolbar />
      <SortProvider adapter={workspaceAdapter}>
      <div className={`mx-auto max-w-[1600px] gap-4 p-4 sm:gap-6 sm:p-6 ${editing ? 'grid lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[15rem_minmax(0,1fr)_17rem]' : 'block'}`}>
        <main className="min-w-0 lg:col-start-1 lg:row-start-1 xl:col-start-2">
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

        {/* One column beside the canvas from 1024px (scrolling on its own, so Properties stay in reach);
            from 1280px it dissolves so each panel takes its own side. */}
        {editing && (
          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto xl:contents">
            <LeftPanel className="xl:col-start-1 xl:row-start-1" />
            <RightPanel className="xl:col-start-3 xl:row-start-1" />
          </div>
        )}
      </div>
      </SortProvider>
    </>
  )
}
