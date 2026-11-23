import Tabs from '../../shared/ui/Tabs'
import AddSection from './AddSection'
import ComponentOutline from './ComponentOutline'
import InspectorPanel from './InspectorPanel'
import LibraryPanel from './LibraryPanel'
import NavigationPanel from './NavigationPanel'
import TemplatesPanel from './TemplatesPanel'
import ThemePanel from './ThemePanel'

/** Left builder panel: the component outline plus the library slot (FS-013 fills it). */
export function LeftPanel() {
  return (
    <aside aria-label="Components panel" className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
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
export function RightPanel() {
  return (
    <aside aria-label="Settings panel" className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
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
