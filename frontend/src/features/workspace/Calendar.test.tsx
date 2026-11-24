import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import type { CalendarEvent } from '../../domain/workspace/types'
import { installFetch } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { goTo, inspector } from '../../test/shell'
import { stubViewport } from '../../test/viewport'
import CalendarWidget from '../../widgets/calendar/CalendarWidget'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'

const PASSWORD = 'correct horse battery'
const editor = () => useEditorStore.getState()

const config = {
  schemaVersion: 1,
  title: 'Ada workspace',
  sections: [
    {
      id: 's-main', kind: 'grid', title: 'Plans',
      widgets: [
        {
          id: 'w-cal', type: 'calendar', title: 'Schedule',
          // Deliberately not in date order: the agenda follows the stored array.
          props: {
            displayMonth: '2026-03',
            events: [
              { id: 'e-late', date: '2026-04-10', title: 'Launch review' },
              { id: 'e-mid', date: '2026-03-18', title: 'Design sync' },
              { id: 'e-early', date: '2026-03-05', title: 'Kick-off' },
            ],
          },
        },
      ],
      layout: [{ i: 'w-cal', x: 0, y: 0, w: 6, h: 8 }],
    },
  ],
}

let server: FakeServer
let viewport: ReturnType<typeof stubViewport>

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  server = createFakeServer({ a: 'Ada workspace' }, { a: config })
  server.session = 'a'
  installFetch(server.handlers)
  viewport = stubViewport(true)
})
afterEach(() => {
  viewport.restore()
  vi.unstubAllGlobals()
})

async function open() {
  render(<App />)
  await screen.findByText('March 2026')
  return userEvent.setup()
}

const settings = inspector
const card = () => within(document.querySelector('[data-widget-id="w-cal"]') as HTMLElement)
const events = () => editor().draftConfig!.sections[0].widgets[0].props.events as CalendarEvent[]
const displayMonth = () => editor().draftConfig!.sections[0].widgets[0].props.displayMonth
const agenda = () => card().getAllByRole('listitem').map((li) => li.textContent)
const saved = () => waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())

async function selectCalendar(user: ReturnType<typeof userEvent.setup>) {
  await goTo(user, 'Outline')
  await user.click(within(screen.getByRole('list', { name: 'Components' })).getByRole('button', { name: 'Schedule' }))
  await goTo(user, 'My workspace')
}

async function logOutAndIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByRole('heading', { name: 'Sign in to your workspace' })
  await user.type(screen.getByLabelText('Email'), 'a@example.com')
  await user.type(screen.getByLabelText('Password'), PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Calendar widget', () => {
  it('shows the saved month as a chronological grid with event days marked', async () => {
    await open()
    const table = card().getByRole('table')
    const days = within(table).getAllByRole('cell').filter((c) => c.textContent)
    expect(days.map((c) => c.textContent!.match(/^\d+/)![0])).toEqual(Array.from({ length: 31 }, (_, n) => String(n + 1)))
    expect(within(table).getByText('5').parentElement).toHaveTextContent('1 event')
    expect(within(table).getByText('18').parentElement).toHaveTextContent('1 event')
    expect(within(table).getByText('10').parentElement).not.toHaveTextContent('event') // 10 April is not in March
  })

  it('lists the agenda in the stored array order, not date order', async () => {
    await open()
    expect(agenda()).toEqual(['Apr 10, 2026Launch review', 'Mar 18, 2026Design sync', 'Mar 5, 2026Kick-off'])
  })

  it('browsing months is transient: it shows other months but never touches the draft', async () => {
    const user = await open()
    const draft = editor().draftConfig
    await user.click(card().getByRole('button', { name: 'Next month' }))
    expect(card().getByText('April 2026')).toBeInTheDocument()
    expect(within(card().getByRole('table')).getByText('10').parentElement).toHaveTextContent('1 event')
    await user.click(card().getByRole('button', { name: 'Previous month' }))
    await user.click(card().getByRole('button', { name: 'Previous month' }))
    expect(card().getByText('February 2026')).toBeInTheDocument()
    expect(editor().draftConfig).toBe(draft)
    expect(selectIsDirty(editor())).toBe(false)
    expect(displayMonth()).toBe('2026-03')
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(server.puts).toHaveLength(0)
  })

  it('works in Preview too, still without dirtying anything', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await user.click(card().getByRole('button', { name: 'Next month' }))
    expect(card().getByText('April 2026')).toBeInTheDocument()
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('offers a way back to the saved month', async () => {
    const user = await open()
    await user.click(card().getByRole('button', { name: 'Next month' }))
    await user.click(card().getByRole('button', { name: 'Back to March 2026' }))
    expect(card().getByText('March 2026')).toBeInTheDocument()
    expect(card().queryByRole('button', { name: /Back to/ })).not.toBeInTheDocument()
  })

  it('does not browse past the supported years', () => {
    const { rerender } = render(<CalendarWidget widgetId="w" title="T" mode="preview" props={{ displayMonth: '1900-01', events: [] }} onChangeProps={() => {}} dispatch={() => ({ ok: true })} />)
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    rerender(<CalendarWidget widgetId="w" title="T" mode="preview" props={{ displayMonth: '2199-12', events: [] }} onChangeProps={() => {}} dispatch={() => ({ ok: true })} />)
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
  })

  it('renders event titles as plain text and shows an empty agenda message', () => {
    const props = { displayMonth: '2026-03', events: [{ id: 'e', date: '2026-03-05', title: '<img src=x onerror=alert(1)>' }] }
    const { unmount } = render(<CalendarWidget widgetId="w" title="T" mode="preview" props={props} onChangeProps={() => {}} dispatch={() => ({ ok: true })} />)
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    unmount()
    render(<CalendarWidget widgetId="w" title="T" mode="edit" props={{ displayMonth: '2026-03', events: [] }} onChangeProps={() => {}} dispatch={() => ({ ok: true })} />)
    expect(screen.getByText(/No events yet. Select this widget and add some in Properties/)).toBeInTheDocument()
  })
})

describe('Calendar inspector', () => {
  it('changing the display month is a real, saved edit that also moves the widget', async () => {
    const user = await open()
    await user.click(card().getByRole('button', { name: 'Next month' })) // transient browsing first
    await selectCalendar(user)
    await user.selectOptions(settings().getByLabelText('Display month'), '11')
    expect(displayMonth()).toBe('2026-11')
    expect(selectIsDirty(editor())).toBe(true)
    expect(card().getByText('November 2026')).toBeInTheDocument() // the saved month wins over earlier browsing
    const year = settings().getByLabelText('Display year')
    await user.clear(year)
    await user.type(year, '2027')
    expect(displayMonth()).toBe('2027-11')
    await user.clear(year)
    await user.type(year, '2300')
    expect(settings().getByRole('alert')).toHaveTextContent('from 1900 to 2199')
    expect(displayMonth()).toBe('2027-11')
  })

  it('edits an event date and title; invalid input never reaches the draft', async () => {
    const user = await open()
    await selectCalendar(user)
    const date = settings().getByLabelText('Date for event 3') as HTMLInputElement
    expect(date).toHaveValue('2026-03-05')
    fireEvent.change(date, { target: { value: '2026-03-25' } })
    expect(events()[2].date).toBe('2026-03-25')
    fireEvent.change(date, { target: { value: '' } }) // an incomplete date from the browser is ignored
    expect(events()[2].date).toBe('2026-03-25')
    expect(settings().queryByRole('alert')).not.toBeInTheDocument() // ...silently, without an error message
    expect(within(card().getByRole('table')).getByText('25').parentElement).toHaveTextContent('1 event')
    const title = settings().getByLabelText('Title for event 3')
    await user.clear(title)
    await user.type(title, 'Planning{Enter}')
    expect(events()[2]).toEqual({ id: 'e-early', date: '2026-03-25', title: 'Planning' })
    await user.clear(settings().getByLabelText('Title for event 3'))
    await user.tab()
    expect(events()[2].title).toBe('Planning')
    expect(settings().getByRole('alert')).toHaveTextContent('needs a title')
    expect(events().map((e) => e.id)).toEqual(['e-late', 'e-mid', 'e-early']) // editing never reorders
  })

  it('adds an event with a stable id and removes events', async () => {
    const user = await open()
    await selectCalendar(user)
    await user.click(settings().getByRole('button', { name: 'Add event' }))
    expect(events()).toHaveLength(4)
    expect(events()[3]).toMatchObject({ date: '2026-03-01', title: 'New event' })
    expect(events()[3].id).toMatch(/^event-[0-9a-f]{12}$/)
    expect(agenda()).toContain('Mar 1, 2026New event')
    await user.click(settings().getByRole('button', { name: 'Remove event 1' }))
    expect(events().map((e) => e.id)).not.toContain('e-late')
  })

  it('edits persist after Save, log out and log in; Cancel reverses them', async () => {
    const user = await open()
    await selectCalendar(user)
    await user.click(settings().getByRole('button', { name: 'Add event' }))
    await user.selectOptions(settings().getByLabelText('Display month'), '6')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(events()).toHaveLength(3)
    expect(displayMonth()).toBe('2026-03')

    await selectCalendar(user)
    await user.click(settings().getByRole('button', { name: 'Add event' }))
    const title = settings().getByLabelText('Title for event 4')
    await user.clear(title)
    await user.type(title, 'Retro{Enter}')
    await user.selectOptions(settings().getByLabelText('Display month'), '4')
    const expected = events()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await saved()
    await logOutAndIn(user)
    await screen.findByText('April 2026')
    expect(events()).toEqual(expected)
    expect(displayMonth()).toBe('2026-04')
    expect(agenda()).toEqual(['Apr 10, 2026Launch review', 'Mar 18, 2026Design sync', 'Mar 5, 2026Kick-off', 'Mar 1, 2026Retro'])
  })
})
