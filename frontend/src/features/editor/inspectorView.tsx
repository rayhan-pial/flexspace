import { createContext, useContext } from 'react'

/** Which view the inspector column shows. Presentation state only: it never enters the workspace JSON. */
export type InspectorView = 'properties' | 'outline' | 'components' | 'templates' | 'appearance'

export const VIEW_TITLES: Record<InspectorView, string> = {
  properties: 'Properties',
  outline: 'Outline',
  components: 'Components',
  templates: 'Templates',
  appearance: 'Appearance',
}

interface InspectorViewValue {
  view: InspectorView
  setView: (view: InspectorView) => void
}

export const InspectorViewContext = createContext<InspectorViewValue>({ view: 'properties', setView: () => {} })

export const useInspectorView = (): InspectorViewValue => useContext(InspectorViewContext)
