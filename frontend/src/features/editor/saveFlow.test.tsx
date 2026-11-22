import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { apiError, deferred, installFetch, json } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { useSessionStore } from '../auth/sessionStore'
import { useEditorStore } from './editorStore'

const PASSWORD = 'correct horse battery'
let server: FakeServer

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  server = createFakeServer()
  server.session = 'a' // an existing browser session: the app bootstraps straight into the workspace
  installFetch(server.handlers)
})
afterEach(() => vi.unstubAllGlobals())

async function open() {
  render(<App />)
  const input = await screen.findByLabelText('Workspace title')
  return { input: input as HTMLInputElement, user: userEvent.setup() }
}

async function retitle(user: ReturnType<typeof userEvent.setup>, input: HTMLInputElement, title: string) {
  await user.clear(input)
  await user.type(input, title)
}

const save = () => screen.getByRole('button', { name: 'Save' })
const cancel = () => screen.getByRole('button', { name: 'Cancel' })
const status = () => screen.getByText(/All changes saved|Unsaved changes|Saving…/)

describe('dirty, saving and saved status', () => {
  it('starts clean with Save and Cancel disabled', async () => {
    await open()
    expect(status()).toHaveTextContent('All changes saved')
    expect(save()).toBeDisabled()
    expect(cancel()).toBeDisabled()
  })

  it('editing marks the workspace unsaved; saving shows progress and then saved', async () => {
    const { input, user } = await open()
    await retitle(user, input, 'Renamed')
    expect(status()).toHaveTextContent('Unsaved changes')
    expect(save()).toBeEnabled()
    expect(cancel()).toBeEnabled()

    const gate = deferred<Response>()
    server.putHook = () => gate.promise
    await user.click(save())
    expect(status()).toHaveTextContent('Saving…')
    expect(save()).toBeDisabled()
    expect(cancel()).toBeDisabled()
    await user.click(save()) // a second click while saving does nothing
    expect(server.puts).toHaveLength(1)

    server.commit('a', server.puts[0])
    gate.resolve(json(200, { id: 'ws-a', revision: 2, updatedAt: 'x', config: server.puts[0].config }))
    await waitFor(() => expect(status()).toHaveTextContent('All changes saved'))
    expect(screen.getByText('Saved revision 2')).toBeInTheDocument()
    expect(save()).toBeDisabled()
  })

  it('editing back to the saved value is clean again', async () => {
    const { input, user } = await open()
    await retitle(user, input, 'Changed')
    expect(status()).toHaveTextContent('Unsaved changes')
    await retitle(user, input, 'Original A')
    expect(status()).toHaveTextContent('All changes saved')
  })

  it('a failed save keeps the edit, shows a dismissible error and can be retried', async () => {
    const { input, user } = await open()
    await retitle(user, input, 'Offline edit')
    server.putHook = () => 'drop'
    await user.click(save())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't reach the server")
    expect(input).toHaveValue('Offline edit')
    expect(save()).toBeEnabled()

    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    server.putHook = undefined
    await user.click(save())
    await waitFor(() => expect(status()).toHaveTextContent('All changes saved'))
  })

  it('rejects over-long titles in the field instead of letting the draft become invalid', async () => {
    const { input } = await open()
    expect(input).toHaveAttribute('maxlength', '120')
  })
})

describe('Cancel', () => {
  it('asks before discarding, and Keep editing leaves the draft alone', async () => {
    const { input, user } = await open()
    await retitle(user, input, 'Unsaved')
    await user.click(cancel())
    const dialog = screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(input).toHaveValue('Unsaved')
  })

  it('Escape closes the dialog without discarding', async () => {
    const { input, user } = await open()
    await retitle(user, input, 'Unsaved')
    await user.click(cancel())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(input).toHaveValue('Unsaved')
  })

  it('confirming restores the last saved version and never contacts the server', async () => {
    const { input, user } = await open()
    await retitle(user, input, 'Unsaved')
    await user.click(cancel())
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(input).toHaveValue('Original A')
    expect(status()).toHaveTextContent('All changes saved')
    expect(server.puts).toHaveLength(0)
  })
})

describe('logout guard', () => {
  it('a clean workspace logs out immediately', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument()
  })

  it('unsaved changes require confirmation before logging out', async () => {
    const { input, user } = await open()
    await retitle(user, input, 'Unsaved')
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Log out and discard changes?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(input).toHaveValue('Unsaved')
    expect(server.session).toBe('a') // still signed in

    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.click(screen.getByRole('button', { name: 'Discard and log out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument()
    expect(server.session).toBeNull()
    expect(screen.queryByDisplayValue('Unsaved')).not.toBeInTheDocument()
  })
})

describe('unsaved-changes guard for reload/close', () => {
  const fire = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('is active only while the draft is dirty', async () => {
    const { input, user } = await open()
    expect(fire()).toBe(false)
    await retitle(user, input, 'Unsaved')
    expect(fire()).toBe(true)
    await user.click(save())
    await waitFor(() => expect(status()).toHaveTextContent('All changes saved'))
    expect(fire()).toBe(false)
  })

  it('is removed again after Cancel', async () => {
    const { input, user } = await open()
    await retitle(user, input, 'Unsaved')
    await user.click(cancel())
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(fire()).toBe(false)
  })
})

describe('conflict', () => {
  async function conflictState() {
    const view = await open()
    await retitle(view.user, view.input, 'My edit')
    server.changeElsewhere('a', (c) => { c.title = 'Their edit' })
    await view.user.click(save())
    const alert = await screen.findByRole('alert')
    return { ...view, alert }
  }

  it('explains the conflict and keeps the draft', async () => {
    const { input, alert } = await conflictState()
    expect(alert).toHaveTextContent('changed in another tab or session')
    expect(alert).toHaveTextContent('revision 2')
    expect(input).toHaveValue('My edit')
    expect(status()).toHaveTextContent('Unsaved changes')
  })

  it('Keep editing dismisses the banner without touching the draft', async () => {
    const { input, user, alert } = await conflictState()
    await user.click(within(alert).getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input).toHaveValue('My edit')
  })

  it('Reload latest asks for confirmation and then shows the server\'s version', async () => {
    const { input, user, alert } = await conflictState()
    await user.click(within(alert).getByRole('button', { name: 'Reload latest' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Discard your changes and reload?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(input).toHaveValue('My edit') // declining changes nothing

    await user.click(screen.getByRole('button', { name: 'Reload latest' }))
    await user.click(screen.getByRole('button', { name: 'Discard and reload' }))
    await waitFor(() => expect(input).toHaveValue('Their edit'))
    expect(status()).toHaveTextContent('All changes saved')
    expect(screen.getByText('Saved revision 2')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('session expiry', () => {
  async function expireWhileEditing() {
    const view = await open()
    await retitle(view.user, view.input, 'Precious unsaved work')
    server.expireSession()
    await view.user.click(save())
    await screen.findByRole('heading', { name: 'Sign in again' })
    return view
  }

  it('hides the workspace and explains how to keep the changes', async () => {
    await expireWhileEditing()
    expect(screen.queryByDisplayValue('Precious unsaved work')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Workspace title')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Your session expired')
    expect(screen.getByText(/Sign in as a@example.com to keep your unsaved changes/)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('a@example.com')
  })

  it('signing in as the same account brings back the unsaved draft', async () => {
    const { user } = await expireWhileEditing()
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const input = await screen.findByLabelText('Workspace title')
    expect(input).toHaveValue('Precious unsaved work')
    expect(status()).toHaveTextContent('Unsaved changes')
    await user.click(save())
    await waitFor(() => expect(status()).toHaveTextContent('All changes saved'))
    expect((server.users.a.config as { title: string }).title).toBe('Precious unsaved work')
  })

  it('signing in as a different account discards the frozen draft', async () => {
    const { user } = await expireWhileEditing()
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'b@example.com')
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const input = await screen.findByLabelText('Workspace title')
    expect(input).toHaveValue('Original B')
    expect(screen.queryByDisplayValue('Precious unsaved work')).not.toBeInTheDocument()
    expect(screen.getByTestId('current-user')).toHaveTextContent('b@example.com')
  })

  it('Discard unsaved changes asks first, then returns to a clean sign-in', async () => {
    const { user } = await expireWhileEditing()
    await user.click(screen.getByRole('button', { name: 'Discard unsaved changes' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep them' }))
    expect(screen.getByRole('heading', { name: 'Sign in again' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Discard unsaved changes' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('')
  })

  it('a wrong password on the re-login screen keeps the draft frozen', async () => {
    const { user } = await expireWhileEditing()
    server.handlers['POST /auth/login'] = () => apiError(401, 'invalid_credentials')
    await user.type(screen.getByLabelText('Password'), 'wrong password!!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
    expect(useEditorStore.getState().draftConfig?.title).toBe('Precious unsaved work')
    expect(useEditorStore.getState().frozen).toBe(true)
  })
})
