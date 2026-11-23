import Tabs from '../../shared/ui/Tabs'
import AddSection from './AddSection'
import ComponentOutline from './ComponentOutline'
import InspectorPanel from './InspectorPanel'
import LibraryPanel from './LibraryPanel'
import NavigationPanel from './NavigationPanel'
import TemplatesPanel from './TemplatesPanel'
import ThemePanel from './ThemePanel'

/**
 * Panels sit beside the canvas. From 1280px each one stays in view while the page scrolls and scrolls
 * on its own when it is taller than the window, so long outlines and forms stay reachable.
 */
const PANEL = 'min-w-0 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto'

/** Left builder panel: the component outline plus the library slot (FS-013 fills it). */
export function LeftPanel({ className = '' }: { className?: string }) {
  return (
    <aside aria-label="Components panel" className={`${PANEL} ${className}`}>
      <Tabs
        label="Components"
        tabs={[
          {
            id: 'outline',
            label: 'Outline',
            content: (
              <>
                <ComponentOutline />
                <AddSection />
                <NavigationPanel />
              </>
            ),
          },
          { id: 'library', label: 'Library', content: <LibraryPanel /> },
        ]}
      />
    </aside>
  )
}

/** Right builder panel: properties, theme and template slots (FS-014, FS-024 fill them). */
export function RightPanel({ className = '' }: { className?: string }) {
  return (
    <aside aria-label="Settings panel" className={`${PANEL} ${className}`}>
      <Tabs
        label="Settings"
        tabs={[
          { id: 'properties', label: 'Properties', content: <InspectorPanel /> },
          { id: 'theme', label: 'Theme', content: <ThemePanel /> },
          { id: 'templates', label: 'Templates', content: <TemplatesPanel /> },
        ]}
      />
    </aside>
  )
}
