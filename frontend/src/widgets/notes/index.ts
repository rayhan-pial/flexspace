import type { NotesProps } from '../../domain/workspace/types'
import type { WidgetDefinition } from '../types'
import NotesWidget, { NOTES_MAX } from './NotesWidget'

export const notesWidget: WidgetDefinition<NotesProps> = {
  type: 'notes',
  label: 'Notes',
  defaultProps: { body: '' },
  fields: [{ key: 'body', label: 'Note', kind: 'textarea', maxLength: NOTES_MAX }],
  Component: NotesWidget,
}
