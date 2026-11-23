import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import type { TaskItem } from '../../domain/workspace/types'
import { installFetch } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { stubViewport } from '../../test/viewport'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'

const PASSWORD = 'correct horse battery'
const editor = () => useEditorStore.getState()

const config = {
  schemaVersion: 1,
  title: 'Ada workspace',
  sections: [
    {
      id: 's-main', kind: 'grid', title: 'Today',
      widgets: [
        { id: 'w-welcome', type: 'welcome', title: 'Welcome', props: { greeting: 'Welcome back', subtitle: 'Here is your day.' } },
        {
          id: 'w-tasks', type: 'tasks', title: 'Tasks',
          props: { items: [{ id: 't1', text: 'Plan the demo', done: false }, { id: 't2', text: 'Write notes', done: true }] },
        },
      ],
      layout: [{ i: 'w-welcome', x: 0, y: 0, w: 12, h: 3 }, { i: 'w-tasks', x: 0, y: 3, w: 6, h: 6 }],
    },
  ],
}

let server: FakeServer
let viewport: ReturnType<typeof stubViewport>

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  server = createFakeServer({ a: 'Ada workspace', b: 'Bea workspace' }, { a: config })
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
  await screen.findByLabelText(/Task text: Plan the demo/)
  return userEvent.setup()
}

const tasksCard = () => within(document.querySelector('[data-widget-id="w-tasks"]') as HTMLElement)
const items = () => (editor().draftConfig!.sections[0].widgets[1].props.items as TaskItem[])
const saved = () => waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
const storedItems = () =>
  ((server.users.a.config as { sections: Array<{ widgets: Array<{ props: { items: TaskItem[] } }> }> }).sections[0].widgets[1].props.items)

async function logOutAndIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByRole('heading', { name: 'Sign in to your workspace' })
  await user.type(screen.getByLabelText('Email'), 'a@example.com')
  await user.type(screen.getByLabelText('Password'), PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Welcome widget', () => {
  it('shows the saved greeting and subtitle as plain text', async () => {
    await open()
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    expect(screen.getByText('Here is your day.')).toBeInTheDocument()
  })

  it('is edited from Properties, live, and persists after Save and login', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Welcome' }))
    const settings = within(screen.getByRole('complementary', { name: 'Settings panel' }))
    await user.clear(settings.getByLabelText('Greeting'))
    await user.type(settings.getByLabelText('Greeting'), 'Good morning <b>Ada</b>')
    await user.clear(settings.getByLabelText('Subtitle'))
    await user.type(settings.getByLabelText('Subtitle'), 'Ship FS-016')
    expect(screen.getByText('Good morning <b>Ada</b>')).toBeInTheDocument() // literal text, no markup
    expect(document.querySelector('[data-widget-id="w-welcome"] b')).toBeNull()
    expect(screen.getByText('Ship FS-016')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await saved()
    await logOutAndIn(user)
    expect(await screen.findByText('Good morning <b>Ada</b>')).toBeInTheDocument()
    expect(screen.getByText('Ship FS-016')).toBeInTheDocument()
  })

  it('shows a hint instead of an empty box when nothing is set', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Welcome' }))
    const settings = within(screen.getByRole('complementary', { name: 'Settings panel' }))
    await user.clear(settings.getByLabelText('Greeting'))
    await user.clear(settings.getByLabelText('Subtitle'))
    expect(screen.getByText(/add a greeting in Properties/)).toBeInTheDocument()
  })
})

describe('Tasks widget', () => {
  it('lists the saved tasks with their completion and a count', async () => {
    await open()
    expect(tasksCard().getByRole('checkbox', { name: /Plan the demo/ })).not.toBeChecked()
    expect(tasksCard().getByRole('checkbox', { name: /Write notes/ })).toBeChecked()
    expect(tasksCard().getByText('1 of 2 done')).toBeInTheDocument()
  })

  it('checking a task works in Preview, dirties the same draft and points to Edit for Save/Cancel', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(tasksCard().queryByLabelText('New task')).not.toBeInTheDocument() // no editing controls in Preview
    expect(tasksCard().queryByRole('button', { name: /Delete task/ })).not.toBeInTheDocument()
    await user.click(tasksCard().getByRole('checkbox', { name: /Plan the demo/ }))
    expect(items()[0].done).toBe(true)
    expect(selectIsDirty(editor())).toBe(true)
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes. Switch to Edit to save or cancel them.')
    expect(server.puts).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Edit workspace' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await saved()
    expect(storedItems()[0].done).toBe(true)
  })

  it('adds a task with a stable id (Enter or the Add button) and clears the box', async () => {
    const user = await open()
    const input = tasksCard().getByLabelText('New task')
    expect(tasksCard().getByRole('button', { name: 'Add' })).toBeDisabled()
    await user.type(input, 'Book the room{Enter}')
    expect(items().map((t) => t.text)).toEqual(['Plan the demo', 'Write notes', 'Book the room'])
    expect(items()[2]).toMatchObject({ done: false })
    expect(items()[2].id).toMatch(/^task-[0-9a-f]{12}$/)
    expect(input).toHaveValue('')
    await user.type(input, 'Second one')
    await user.click(tasksCard().getByRole('button', { name: 'Add' }))
    expect(items()).toHaveLength(4)
    expect(new Set(items().map((t) => t.id)).size).toBe(4)
  })

  it('renames on Enter or blur, discards on Escape, and refuses an empty name', async () => {
    const user = await open()
    const field = () => tasksCard().getByLabelText(/Task text: Plan the demo/)
    await user.clear(field())
    await user.type(field(), 'Plan the launch{Enter}')
    expect(items()[0]).toEqual({ id: 't1', text: 'Plan the launch', done: false })

    const second = tasksCard().getByLabelText(/Task text: Write notes/)
    await user.type(second, ' today')
    await user.tab() // blur commits
    expect(items()[1].text).toBe('Write notes today')

    const renamed = tasksCard().getByLabelText(/Task text: Plan the launch/)
    await user.type(renamed, ' XYZ{Escape}')
    expect(items()[0].text).toBe('Plan the launch')
    expect(tasksCard().getByLabelText(/Task text: Plan the launch/)).toHaveValue('Plan the launch')

    await user.clear(tasksCard().getByLabelText(/Task text: Plan the launch/))
    await user.tab()
    expect(items()[0].text).toBe('Plan the launch') // the empty edit never reached the draft
    expect(tasksCard().getByRole('alert')).toHaveTextContent('needs some text')
  })

  it('deletes a task, keeping the others and their ids', async () => {
    const user = await open()
    await user.click(tasksCard().getByRole('button', { name: 'Delete task "Plan the demo"' }))
    expect(items()).toEqual([{ id: 't2', text: 'Write notes', done: true }])
    await user.click(tasksCard().getByRole('button', { name: 'Delete task "Write notes"' }))
    expect(tasksCard().getByText('No tasks yet. Add one below.')).toBeInTheDocument()
  })

  it('markup in a task is shown literally', async () => {
    const user = await open()
    await user.type(tasksCard().getByLabelText('New task'), '<img src=x onerror=alert(1)>{Enter}')
    expect(tasksCard().getByLabelText('Task text: <img src=x onerror=alert(1)>')).toHaveValue('<img src=x onerror=alert(1)>')
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(tasksCard().getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('Cancel reverses every task change', async () => {
    const user = await open()
    await user.click(tasksCard().getByRole('checkbox', { name: /Plan the demo/ }))
    await user.type(tasksCard().getByLabelText('New task'), 'Temp{Enter}')
    await user.click(tasksCard().getByRole('button', { name: 'Delete task "Write notes"' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(items()).toEqual(config.sections[0].widgets[1].props!.items)
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('changed text, completion and deletion persist after Save, log out and log in', async () => {
    const user = await open()
    await user.click(tasksCard().getByRole('checkbox', { name: /Plan the demo/ }))
    await user.type(tasksCard().getByLabelText('New task'), 'Book the room{Enter}')
    await user.click(tasksCard().getByRole('button', { name: 'Delete task "Write notes"' }))
    const typed = tasksCard().getByLabelText(/Task text: Plan the demo/)
    await user.type(typed, ' v2{Enter}')
    const expected = items()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await saved()
    expect(storedItems()).toEqual(expected)

    await logOutAndIn(user)
    await screen.findByLabelText(/Task text: Plan the demo v2/)
    expect(items()).toEqual(expected)
    expect(tasksCard().getByRole('checkbox', { name: /Plan the demo v2/ })).toBeChecked()
    expect(tasksCard().queryByLabelText(/Task text: Write notes/)).not.toBeInTheDocument()
    expect(tasksCard().getByLabelText(/Task text: Book the room/)).toBeInTheDocument()
  })

  it('disables adding at the 100-task limit', async () => {
    await open()
    for (let n = 0; n < 98; n += 1) {
      editor().apply((c) => ({
        ok: true,
        config: {
          ...c,
          sections: c.sections.map((s) => ({
            ...s,
            widgets: s.widgets.map((w) => (w.id === 'w-tasks' ? { ...w, props: { items: [...(w.props.items as TaskItem[]), { id: `bulk-${n}`, text: `Bulk ${n}`, done: false }] } } : w)),
          })),
        },
      }))
    }
    await waitFor(() => expect(items()).toHaveLength(100))
    expect(tasksCard().getByLabelText('New task')).toBeDisabled()
    expect(tasksCard().getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})
