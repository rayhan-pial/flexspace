import AddSection from './AddSection'
import ComponentOutline from './ComponentOutline'
import InspectorPanel from './InspectorPanel'
import { useInspectorView, VIEW_TITLES } from './inspectorView'
import LibraryPanel from './LibraryPanel'
import NavigationPanel from './NavigationPanel'
import TemplatesPanel from './TemplatesPanel'
import ThemePanel from './ThemePanel'

/**
 * The one contextual column beside the canvas. The application rail picks which existing builder
 * view it shows; it scrolls on its own (sticky, up to the window height) so long outlines and
 * forms stay reachable without covering the canvas.
 */
export default function Inspector({ className = '' }: { className?: string }) {
  const { view } = useInspectorView()
  return (
    <aside
      aria-label="Inspector"
      className={`min-w-0 rounded-ui-card bg-ui-surface p-4 shadow-ui-surface ring-1 ring-ui-border lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto ${className}`}
    >
      <h2 className="mb-3 border-b border-ui-border pb-3 text-base font-semibold text-ui-text">{VIEW_TITLES[view]}</h2>
      {view === 'properties' && <InspectorPanel />}
      {view === 'outline' && (
        <>
          <ComponentOutline />
          <AddSection />
          <NavigationPanel />
        </>
      )}
      {view === 'components' && <LibraryPanel />}
      {view === 'templates' && <TemplatesPanel />}
      {view === 'appearance' && <ThemePanel />}
    </aside>
  )
}
