import { DEFAULT_WIDGET_PROPS } from '../../domain/workspace/defaults'
import type { AnalyticsProps } from '../../domain/workspace/types'
import type { WidgetDefinition } from '../types'
import AnalyticsInspector from './AnalyticsInspector'
import AnalyticsWidget from './AnalyticsWidget'

export const analyticsWidget: WidgetDefinition<AnalyticsProps> = {
  type: 'analytics',
  label: 'Analytics',
  defaultProps: DEFAULT_WIDGET_PROPS.analytics,
  fields: [],
  Component: AnalyticsWidget,
  Inspector: AnalyticsInspector,
}
