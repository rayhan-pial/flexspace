import type { NavPlacement, SectionKind, Theme, WorkspaceConfig } from '../../domain/workspace/types'
import { isKnownWidgetType, widgetTypeLabel } from '../workspace/registry'

export interface TemplateSummary {
  title: string
  placement: NavPlacement
  theme: Pick<Theme, 'primary' | 'background' | 'surface' | 'text' | 'fontFamily'>
  navigation: string[]
  sections: Array<{ title: string; kind: SectionKind; widgets: string[] }>
  widgetCount: number
}

const PLACEMENT_LABEL: Record<NavPlacement, string> = { top: 'top bar', left: 'left sidebar', right: 'right sidebar' }
export const describePlacement = (placement: NavPlacement): string => PLACEMENT_LABEL[placement]

/** What a template contains, in words: enough to choose between templates without applying one. */
export function summarizeTemplate(config: WorkspaceConfig): TemplateSummary {
  const { primary, background, surface, text, fontFamily } = config.theme
  return {
    title: config.title,
    placement: config.navigation.placement,
    theme: { primary, background, surface, text, fontFamily },
    navigation: [...config.navigation.primaryItems, ...config.navigation.secondaryItems].map((item) => item.label),
    sections: config.sections.map((section) => ({
      title: section.title || 'Untitled section',
      kind: section.kind,
      widgets: section.widgets.map((widget) => widget.title || (isKnownWidgetType(widget.type) ? widgetTypeLabel(widget.type) : 'Unsupported widget')),
    })),
    widgetCount: config.sections.reduce((sum, section) => sum + section.widgets.length, 0),
  }
}
