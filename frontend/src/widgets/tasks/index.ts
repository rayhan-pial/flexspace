import { DEFAULT_WIDGET_PROPS } from '../../domain/workspace/defaults'
import type { TasksProps } from '../../domain/workspace/types'
import type { WidgetDefinition } from '../types'
import TasksWidget from './TasksWidget'

export const tasksWidget: WidgetDefinition<TasksProps> = {
  type: 'tasks',
  label: 'Tasks',
  defaultProps: DEFAULT_WIDGET_PROPS.tasks,
  fields: [], // the list is edited inside the widget itself
  Component: TasksWidget,
}
