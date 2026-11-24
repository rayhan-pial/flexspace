import { useEffect, useMemo, useRef, useState } from 'react'
import Inspector from '../editor/Inspector'
import { InspectorViewContext } from '../editor/inspectorView'
import type { InspectorView } from '../editor/inspectorView'
import { useEditorStore } from '../editor/editorStore'
import EditorToolbar from '../editor/EditorToolbar'
import { useEditSessions, useHistoryShortcuts } from '../editor/useHistoryControls'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import SortProvider from '../sorting/SortProvider'
import { workspaceAdapter } from '../sorting/workspaceAdapter'
import ApplicationRail from './ApplicationRail'
import WorkspaceView from './WorkspaceView'

/**
 * The editing surface. In Edit on desktop it has three areas: the application rail, the toolbar
 * and canvas, and one inspector column. In Preview, or below desktop width, only the toolbar and
 * the canvas remain: the rail, inspector and handles are gone.
 */
export default function EditorShell() {
  const hasDraft = useEditorStore((s) => s.draftConfig !== null)
  const selection = useEditorStore((s) => s.selection)
  const gesture = useEditorStore((s) => s.interaction.gesture)
  const mode = useEffectiveMode()
  const [view, setView] = useState<InspectorView>('properties')
  const value = useMemo(() => ({ view, setView }), [view])
  // Where the last interaction happened: picking something on the canvas opens its Properties,
  // while picking it in the inspector (the outline) leaves the inspector where it is.
  const source = useRef<'canvas' | 'inspector'>('inspector')
  useEditSessions()
  useHistoryShortcuts(mode === 'edit')

  useEffect(() => {
    if (selection && source.current === 'canvas' && !gesture) setView('properties')
  }, [selection, gesture])

  if (!hasDraft) return null

  const editing = mode === 'edit'

  return (
    <InspectorViewContext.Provider value={value}>
      <a
        href="#workspace-canvas"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-ui-control focus:bg-ui-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ui-primary focus:shadow-ui-dialog"
      >
        Skip to workspace
      </a>
      <div className={editing ? 'flex items-start' : ''}>
        {editing && <ApplicationRail />}
        <div className="min-w-0 flex-1">
          <EditorToolbar />
          <SortProvider adapter={workspaceAdapter}>
            <div className={editing ? 'grid gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,1fr)_17.5rem] xl:grid-cols-[minmax(0,1fr)_19rem]' : 'mx-auto block max-w-[1600px] p-4 sm:p-6'}>
              <main
                id="workspace-canvas"
                tabIndex={-1}
                className="min-w-0 outline-none"
                onPointerDownCapture={() => { source.current = 'canvas' }}
                onKeyDownCapture={() => { source.current = 'canvas' }}
              >
                <WorkspaceView />
              </main>
              {editing && (
                <div
                  className="contents"
                  onPointerDownCapture={() => { source.current = 'inspector' }}
                  onKeyDownCapture={() => { source.current = 'inspector' }}
                >
                  <Inspector />
                </div>
              )}
            </div>
          </SortProvider>
        </div>
      </div>
    </InspectorViewContext.Provider>
  )
}
