import { DEFAULT_WIDGET_PROPS } from '../../domain/workspace/defaults'
import type { CalendarProps } from '../../domain/workspace/types'
import type { WidgetDefinition } from '../types'
import CalendarInspector from './CalendarInspector'
import CalendarWidget from './CalendarWidget'

export const calendarWidget: WidgetDefinition<CalendarProps> = {
  type: 'calendar',
  label: 'Calendar',
  defaultProps: DEFAULT_WIDGET_PROPS.calendar,
  fields: [],
  Component: CalendarWidget,
  Inspector: CalendarInspector,
}
