import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MAX_LIST_ITEMS } from '../domain/workspace/constants'
import CalendarWidget from './calendar/CalendarWidget'
import TasksWidget from './tasks/TasksWidget'
import type { WidgetRenderProps } from './types'

/* UI-029: a natively disabled control inside a widget says why, in text attached with aria-describedby. */

const noop = () => undefined
const base = { widgetId: 'w', title: 'Widget', onChangeProps: noop, dispatch: () => ({ ok: true as const }) }

describe('Tasks Add button', () => {
  const tasks = (items: Array<{ id: string; text: string; done: boolean }>): WidgetRenderProps<{ items: typeof items }> => ({ ...base, mode: 'edit', props: { items } })

  it('explains that a task has to be typed first, and enables once it is', async () => {
    render(<TasksWidget {...tasks([])} />)
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription('Type a task first.')
    await userEvent.setup().type(screen.getByLabelText('New task'), 'Buy milk')
    expect(add).toBeEnabled()
    expect(add).not.toHaveAttribute('aria-describedby')
  })

  it('explains the list limit', () => {
    const items = Array.from({ length: MAX_LIST_ITEMS }, (_, i) => ({ id: `t${i}`, text: `Task ${i}`, done: false }))
    render(<TasksWidget {...tasks(items)} />)
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription(`This list has reached the limit of ${MAX_LIST_ITEMS} tasks.`)
  })
})

describe('Calendar month buttons', () => {
  it('explain the earliest and latest supported month', () => {
    const { rerender } = render(<CalendarWidget {...base} mode="preview" props={{ displayMonth: '1900-01', events: [] }} />)
    const previous = screen.getByRole('button', { name: 'Previous month' })
    expect(previous).toBeDisabled()
    expect(previous).toHaveAccessibleDescription('This is the earliest month you can show.')
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled()
    rerender(<CalendarWidget {...base} mode="preview" props={{ displayMonth: '2199-12', events: [] }} />)
    const next = screen.getByRole('button', { name: 'Next month' })
    expect(next).toBeDisabled()
    expect(next).toHaveAccessibleDescription('This is the latest month you can show.')
  })
})
