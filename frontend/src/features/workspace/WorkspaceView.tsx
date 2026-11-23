import { useEditorStore } from '../editor/editorStore'
import SectionView from './SectionView'
import SimpleNav from './SimpleNav'

/** Walks the draft's ordered sections and renders them (plus the temporary navigation). */
export default function WorkspaceView() {
  const draft = useEditorStore((s) => s.draftConfig)
  if (!draft) return null

  const placement = draft.navigation.placement
  const direction = placement === 'top' ? 'flex-col' : placement === 'left' ? 'flex-col lg:flex-row' : 'flex-col lg:flex-row-reverse'

  return (
    <div className={`mt-6 flex gap-6 ${direction}`}>
      <SimpleNav navigation={draft.navigation} />
      <div className="min-w-0 flex-1 space-y-8">
        {draft.sections.filter((section) => !section.hidden).map((section) => (
          <SectionView key={section.id} section={section} />
        ))}
        {draft.sections.every((section) => section.hidden) && (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {draft.sections.length === 0
              ? 'This workspace has no sections yet. Add one from the outline in Edit mode.'
              : 'All sections are hidden. Show them from the outline in Edit mode.'}
          </p>
        )}
      </div>
    </div>
  )
}
