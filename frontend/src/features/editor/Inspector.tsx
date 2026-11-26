import { useLayoutEffect, useRef } from 'react'
import AddSection from './AddSection'
import ComponentOutline from './ComponentOutline'
import InspectorPanel from './InspectorPanel'
import { useInspectorView, VIEW_TITLES } from './inspectorView'
import NavigationPanel from './NavigationPanel'
import Button from '../../shared/ui/Button'
import ThemePanel from './ThemePanel'

/**
 * The one contextual column beside the canvas. The application rail picks which existing builder
 * view it shows; it scrolls on its own (sticky, up to the window height) so long outlines and
 * forms stay reachable without covering the canvas.
 */
export default function Inspector({ className = '' }: { className?: string }) {
  const { view, setView, added, dismissAdded, inspectorScroll } = useInspectorView()
  const ref = useRef<HTMLElement>(null)

  // Hiding the inspector unmounts the column; remember where it was scrolled and put it back on reopen.
  useLayoutEffect(() => {
    const element = ref.current
    if (element) element.scrollTop = inspectorScroll.current
    return () => {
      if (element) inspectorScroll.current = element.scrollTop
    }
  }, [inspectorScroll])

  return (
    <aside
      ref={ref}
      aria-label="Inspector"
      className={`min-w-0 rounded-ui-card bg-ui-surface p-4 shadow-ui-surface ring-1 ring-ui-border lg:sticky lg:top-[calc(var(--toolbar-h,0px)+1rem)] lg:max-h-[calc(100vh-var(--toolbar-h,0px)-2rem)] lg:self-start lg:overflow-y-auto ${className}`}
    >
      <h2 className="mb-3 border-b border-ui-border pb-3 text-base font-semibold text-ui-text">{VIEW_TITLES[view]}</h2>
      {view !== 'properties' && (
        <Button className="mb-3" onClick={() => setView('properties')}>
          <span aria-hidden="true">←</span> Back to properties
        </Button>
      )}
      {view === 'properties' && added && (
        <p role="status" data-testid="add-confirmation" className="mb-3 rounded-ui-control bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Added {added.typeLabel} to {added.sectionTitle} ({added.kind === 'grid' ? 'dashboard grid' : 'stack'}) and selected it. Its properties are below. This change is unsaved.{' '}
          <button type="button" onClick={dismissAdded} className="ui-focus font-medium underline">Dismiss</button>
        </p>
      )}
      {view === 'properties' && <InspectorPanel />}
      {view === 'outline' && (
        <>
          <ComponentOutline />
          <AddSection />
          <NavigationPanel />
        </>
      )}
      {view === 'appearance' && <ThemePanel />}
    </aside>
  )
}
