import type { ReactNode } from 'react'
import { AppearanceIcon, BrandMark, ComponentsIcon, OutlineIcon, TemplatesIcon, WorkspaceIcon } from '../../shared/ui/icons'
import { useInspectorView } from '../editor/inspectorView'
import type { InspectorView } from '../editor/inspectorView'
import AccountControls from './AccountControls'

const DESTINATIONS: Array<{ view: InspectorView; label: string; icon: ReactNode }> = [
  { view: 'properties', label: 'My workspace', icon: <WorkspaceIcon /> },
  { view: 'outline', label: 'Outline', icon: <OutlineIcon /> },
  { view: 'components', label: 'Components', icon: <ComponentsIcon /> },
  { view: 'templates', label: 'Templates', icon: <TemplatesIcon /> },
  { view: 'appearance', label: 'Appearance', icon: <AppearanceIcon /> },
]

/**
 * The editor's own navigation (never the user's workspace navigation). Each destination shows an
 * existing builder view in the inspector; nothing here is saved or changes the workspace. It is a
 * 64px icon rail from 1024px and a 192px labelled rail from 1440px.
 */
export default function ApplicationRail() {
  const { view, setView } = useInspectorView()
  return (
    <aside className="sticky top-0 z-10 flex h-screen w-16 shrink-0 flex-col gap-4 border-r border-ui-border bg-ui-surface px-2 py-4 min-[1440px]:w-48 min-[1440px]:px-3">
      <div className="flex items-center justify-center gap-2 min-[1440px]:justify-start min-[1440px]:px-1">
        <BrandMark />
        <span className="sr-only text-lg font-semibold tracking-tight min-[1440px]:not-sr-only">FlexSpace</span>
      </div>
      <nav aria-label="Editor navigation" className="flex-1">
        <ul className="flex flex-col gap-1">
          {DESTINATIONS.map(({ view: id, label, icon }) => {
            const current = id === view
            return (
              <li key={id}>
                <button
                  type="button"
                  title={label}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => setView(id)}
                  className={`ui-focus flex h-11 w-full items-center justify-center gap-3 rounded-ui-control text-sm font-medium transition-colors min-[1440px]:justify-start min-[1440px]:px-3 ${
                    current ? 'bg-ui-selected text-ui-selected-text' : 'text-ui-muted hover:bg-ui-subtle hover:text-ui-text'
                  }`}
                >
                  {icon}
                  <span className="sr-only min-[1440px]:not-sr-only">{label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <AccountControls layout="rail" />
    </aside>
  )
}
