import { createContext, useContext } from 'react'

/** Which view the inspector column shows. Presentation state only: it never enters the workspace JSON. */
export type InspectorView = 'properties' | 'outline' | 'appearance'

export const VIEW_TITLES: Record<InspectorView, string> = {
  properties: 'Properties',
  outline: 'Outline',
  appearance: 'Appearance',
}

interface InspectorViewValue {
  view: InspectorView
  setView: (view: InspectorView) => void
  /** The Add component dialog is open. Presentation state only, like the inspector view. */
  libraryOpen: boolean
  openLibrary: () => void
  closeLibrary: () => void
  /** The Templates gallery dialog is open. */
  templatesOpen: boolean
  openTemplates: () => void
  closeTemplates: () => void
  /** Whether the inspector column is shown beside the canvas. Hiding keeps the selection, view and draft; only the column goes. */
  inspectorOpen: boolean
  setInspectorOpen: (open: boolean) => void
  /** The inspector's scroll position while it is hidden, so reopening returns to the same spot. */
  inspectorScroll: { current: number }
  /** What the last Add put into the draft, while that widget is still selected. Shown in the inspector, so the canvas never shifts. */
  added: { typeLabel: string; sectionTitle: string; kind: 'grid' | 'stack' } | null
  dismissAdded: () => void
}

export const InspectorViewContext = createContext<InspectorViewValue>({
  added: null,
  dismissAdded: () => {},
  view: 'properties',
  setView: () => {},
  libraryOpen: false,
  openLibrary: () => {},
  closeLibrary: () => {},
  templatesOpen: false,
  openTemplates: () => {},
  closeTemplates: () => {},
  inspectorOpen: true,
  setInspectorOpen: () => {},
  inspectorScroll: { current: 0 },
})

export const useInspectorView = (): InspectorViewValue => useContext(InspectorViewContext)
