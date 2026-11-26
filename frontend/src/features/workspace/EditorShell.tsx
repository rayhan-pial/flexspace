import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LibraryDialog from '../editor/LibraryDialog'
import TemplatesDialog from '../editor/TemplatesDialog'
import type { AddedWidget } from '../editor/LibraryDialog'
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
  const reloading = useEditorStore((s) => s.reloading)
  const mode = useEffectiveMode()
  const [view, setView] = useState<InspectorView>('properties')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryTarget, setLibraryTarget] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [added, setAdded] = useState<AddedWidget | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const inspectorScroll = useRef(0)
  const columnRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const openLibrary = useCallback((sectionId?: string) => {
    setLibraryTarget(typeof sectionId === 'string' ? sectionId : null)
    setLibraryOpen(true)
  }, [])
  const closeLibrary = useCallback(() => setLibraryOpen(false), [])
  const openTemplates = useCallback(() => setTemplatesOpen(true), [])
  const closeTemplates = useCallback(() => setTemplatesOpen(false), [])
  const dismissAdded = useCallback(() => setAdded(null), [])
  const value = useMemo(
    () => ({ view, setView, libraryOpen, openLibrary, libraryTarget, canAddFromCanvas: true, closeLibrary, templatesOpen, openTemplates, closeTemplates, inspectorOpen, setInspectorOpen, inspectorScroll, added, dismissAdded }),
    [view, libraryOpen, openLibrary, libraryTarget, closeLibrary, templatesOpen, openTemplates, closeTemplates, inspectorOpen, added, dismissAdded],
  )
  // Where the last interaction happened: picking something on the canvas opens its Properties,
  // while picking it in the inspector (the outline) leaves the inspector where it is.
  const source = useRef<'canvas' | 'inspector'>('inspector')
  const pressAt = useRef<{ x: number; y: number } | null>(null)
  useEditSessions()
  useHistoryShortcuts(mode === 'edit')

  useEffect(() => {
    if (selection && source.current === 'canvas' && !gesture) setView('properties')
  }, [selection, gesture])

  // The Add dialog and its confirmation belong to Edit: leaving it (Preview, a narrow window) closes them,
  // and a confirmation stops applying once something else is selected. Adjusted during render, not in an effect.
  const [seenMode, setSeenMode] = useState(mode)
  if (seenMode !== mode) {
    setSeenMode(mode)
    if (mode !== 'edit') {
      setLibraryOpen(false)
      setTemplatesOpen(false)
      setAdded(null)
    }
  }
  if (added && selection?.id !== added.widgetId) setAdded(null)

  // After an Add the new card must be seen: wait for it to be drawn (the grid measures first), then
  // scroll it to the middle and focus it. This runs after the dialog has returned focus to its opener.
  useEffect(() => {
    if (!added) return
    let frame = 0
    let tries = 0
    function reveal() {
      const card = document.querySelector<HTMLElement>(`[data-widget-id="${added!.widgetId}"]`)
      if (card) {
        card.scrollIntoView?.({ block: 'center', behavior: 'auto' })
        card.focus({ preventScroll: true })
        return
      }
      tries += 1
      if (tries < 60) frame = requestAnimationFrame(reveal)
    }
    frame = requestAnimationFrame(reveal)
    return () => cancelAnimationFrame(frame)
  }, [added])

  // Share the toolbar's height (it grows when a banner or a second row appears) with the layout below it.
  useEffect(() => {
    const toolbar = toolbarRef.current
    const column = columnRef.current
    if (!toolbar || !column || typeof ResizeObserver === 'undefined') return
    const update = () => column.style.setProperty('--toolbar-h', `${toolbar.getBoundingClientRect().height}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(toolbar)
    return () => observer.disconnect()
  }, [hasDraft, mode])

  if (!hasDraft) return null

  const editing = mode === 'edit'
  const showInspector = editing && inspectorOpen

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
        <div ref={columnRef} className="flex min-h-screen min-w-0 flex-1 flex-col">
          {/* From desktop width the toolbar stays at the top while the page scrolls; its height is shared as a CSS variable so
              the inspector and section jumps can sit below it. */}
          <div ref={toolbarRef} className="lg:sticky lg:top-0 lg:z-20">
            <EditorToolbar />
          </div>
          <SortProvider adapter={workspaceAdapter}>
            <div inert={reloading} aria-busy={reloading || undefined} className={(reloading ? 'opacity-60 ' : '') + (showInspector ? 'grid flex-1 lg:grid-cols-[minmax(0,1fr)_calc(17.5rem+3rem)] xl:grid-cols-[minmax(0,1fr)_calc(19rem+3rem)]' : 'flex flex-1 flex-col')}>
              <main
                id="workspace-canvas"
                tabIndex={-1}
                className="flex min-w-0 flex-1 flex-col outline-none"
                onPointerDownCapture={(event) => {
                  source.current = 'canvas'
                  pressAt.current = { x: event.clientX, y: event.clientY }
                }}
                // Clicking (not dragging) a card's own area is an explicit request for its Properties, even if it was
                // already selected. Grabbing and moving a card, or using a control inside it, leaves the inspector alone.
                onClickCapture={(event) => {
                  const target = event.target as HTMLElement
                  const press = pressAt.current
                  const moved = press ? Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5 : false
                  if (editing && !moved && target.closest?.('[data-widget-id]') && !target.closest?.('button, [role="button"]:not([data-widget-id]), input, textarea, select, .react-resizable-handle')) setView('properties')
                }}
                onKeyDownCapture={() => { source.current = 'canvas' }}
              >
                <WorkspaceView />
              </main>
              {showInspector && (
                <div
                  className="min-w-0 p-4 sm:p-6"
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
      {templatesOpen && editing && <TemplatesDialog onClose={closeTemplates} />}
      {libraryOpen && editing && (
        <LibraryDialog
          initialSectionId={libraryTarget}
          onClose={closeLibrary}
          onOpenOutline={() => {
            setLibraryOpen(false)
            setView('outline')
          }}
          onAdded={(next) => {
            setLibraryOpen(false)
            setView('properties')
            setAdded(next)
          }}
        />
      )}
    </InspectorViewContext.Provider>
  )
}
