import type { ReactNode } from 'react'
import { useEditorStore } from '../editor/editorStore'
import { useEffectiveMode } from '../editor/useEffectiveMode'
import SortHandle from '../sorting/SortHandle'
import SortProvider from '../sorting/SortProvider'
import { useOptionalSortContext } from '../sorting/sortContext'
import SortableSection from '../sorting/SortableSection'
import { SECTION_ITEM_TYPE, SECTIONS_ROOT, workspaceAdapter } from '../sorting/workspaceAdapter'
import SectionView from './SectionView'
import { themeVariables } from './theme'
import SimpleNav from './SimpleNav'

/** The editor shell provides one drag provider for the outline and the canvas; on its own the view brings its own. */
function WithSorting({ children }: { children: ReactNode }) {
  const inherited = useOptionalSortContext() !== null
  return inherited ? <>{children}</> : <SortProvider adapter={workspaceAdapter}>{children}</SortProvider>
}

/**
 * Walks the draft's ordered sections and renders them (plus the navigation). In Edit the sections
 * are a sortable root container: each has a grip beside its title, and a section carries all of
 * its widgets, geometry and settings with it because only its position in `sections[]` changes.
 */
export default function WorkspaceView() {
  const draft = useEditorStore((s) => s.draftConfig)
  const editing = useEffectiveMode() === 'edit'
  if (!draft) return null

  const placement = draft.navigation.placement
  const direction = placement === 'top' ? 'flex-col' : placement === 'left' ? 'flex-col lg:flex-row' : 'flex-col lg:flex-row-reverse'
  const visibleSections = draft.sections.filter((section) => !section.hidden)
  const byId = new Map(visibleSections.map((section) => [section.id, section]))

  return (
    <WithSorting>
      <div style={themeVariables(draft.theme)} className={`fs-themed mt-6 flex gap-6 rounded-2xl p-4 ${direction}`}>
        <SimpleNav navigation={draft.navigation} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <SortableSection
              containerId={SECTIONS_ROOT}
              itemType={SECTION_ITEM_TYPE}
              items={visibleSections.map((section) => section.id)}
              orientation="vertical"
              label="Sections"
              emptyLabel="No visible sections."
              className="gap-8"
              renderItem={(id, { handleRef }) => {
                const section = byId.get(id)
                if (!section) return null
                return <SectionView section={section} handle={<SortHandle handleRef={handleRef} label={`Reorder section ${section.title || 'Untitled section'}`} />} />
              }}
            />
          ) : (
            <div className="space-y-8">
              {visibleSections.map((section) => (
                <SectionView key={section.id} section={section} />
              ))}
            </div>
          )}
          {draft.sections.every((section) => section.hidden) && (
            <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              {draft.sections.length === 0
                ? 'This workspace has no sections yet. Add one from the outline in Edit mode.'
                : 'All sections are hidden. Show them from the outline in Edit mode.'}
            </p>
          )}
        </div>
      </div>
    </WithSorting>
  )
}
