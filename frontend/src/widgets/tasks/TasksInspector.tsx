import { useState } from 'react'
import type { TasksProps } from '../../domain/workspace/types'
import MoveButtons from '../../features/sorting/MoveButtons'
import { listContainerId, transferTargets, workspaceAdapter } from '../../features/sorting/workspaceAdapter'
import { SelectField } from '../../shared/ui/fields'
import type { WidgetInspectorProps } from '../types'

/**
 * Order controls for the tasks of the selected widget: pick a task, then Move up, Move down or
 * Move to another Tasks widget. These are the keyboard- and screen-reader-friendly twin of dragging
 * a row, and they run the very same move command.
 */
export default function TasksInspector({ widgetId, props }: WidgetInspectorProps<TasksProps>) {
  const [picked, setPicked] = useState<string | null>(null)
  if (props.items.length === 0) return null

  // Fall back to the first task if the picked one was moved away or deleted.
  const taskId = props.items.some((item) => item.id === picked) ? picked! : props.items[0].id
  const task = props.items.find((item) => item.id === taskId)!

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">Order tasks</legend>
      <SelectField
        label="Task to move"
        value={taskId}
        onChange={setPicked}
        options={props.items.map((item, index) => ({ value: item.id, label: `${index + 1}. ${item.text.slice(0, 40)}` }))}
      />
      <MoveButtons
        adapter={workspaceAdapter}
        itemId={task.id}
        containerId={listContainerId('tasks', widgetId)}
        otherContainers={transferTargets('tasks', widgetId)}
        subject="task"
      />
    </fieldset>
  )
}
