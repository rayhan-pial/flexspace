import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../features/auth/sessionStore'
import {
  apiError, authResponse, deferred, installFetch, json, noContent, workspaceEnvelope,
} from '../test/fakeApi'
import App from './App'

const PASSWORD = 'correct horse battery'
const SECTIONS = [{ id: 's1', kind: 'stack', title: 'Today', widgets: [{ id: 'w1', type: 'notes' }] }]

beforeEach(() => useSessionStore.setState(useSessionStore.getInitialState(), true))
afterEach(() => vi.unstubAllGlobals())

async function fillAndSubmit(email: string, password: string, button: RegExp | string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: button }))
  return user
}

describe('signed out', () => {
  it('shows an accessible sign-in form after an anonymous bootstrap', async () => {
    installFetch({ 'GET /auth/me': () => apiError(401, 'unauthenticated') })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('signs in and shows only that user\'s workspace', async () => {
    installFetch({
      'GET /auth/me': () => apiError(401, 'unauthenticated'),
      'POST /auth/login': () => json(200, authResponse('a')),
      'GET /workspace': () => json(200, workspaceEnvelope('Ada workspace', 4, SECTIONS)),
    })
    render(<App />)
    await screen.findByLabelText('Email')
    await fillAndSubmit('a@example.com', PASSWORD, 'Sign in')
    expect(await screen.findByRole('heading', { name: 'Ada workspace' })).toBeInTheDocument()
    expect(screen.getByText('Saved revision 4')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByTestId('current-user')).toHaveTextContent('a@example.com')
  })

  it('explains a failed login, clears the password and re-enables the form', async () => {
    installFetch({
      'GET /auth/me': () => apiError(401, 'unauthenticated'),
      'POST /auth/login': () => apiError(401, 'invalid_credentials'),
    })
    render(<App />)
    await screen.findByLabelText('Email')
    await fillAndSubmit('a@example.com', 'wrong password!!', 'Sign in')
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('prevents double submission while a request is pending', async () => {
    const pending = deferred<Response>()
    const { calls } = installFetch({
      'GET /auth/me': () => apiError(401, 'unauthenticated'),
      'POST /auth/login': () => pending.promise,
    })
    render(<App />)
    await screen.findByLabelText('Email')
    const user = await fillAndSubmit('a@example.com', PASSWORD, 'Sign in')
    const busy = await screen.findByRole('button', { name: 'Signing in…' })
    expect(busy).toBeDisabled()
    await user.click(busy)
    await user.keyboard('{Enter}')
    expect(calls.filter((c) => c.path === '/auth/login')).toHaveLength(1)
    pending.resolve(apiError(401, 'invalid_credentials'))
    await screen.findByRole('alert')
  })

  it('registers a new account and highlights server-side field errors', async () => {
    installFetch({
      'GET /auth/me': () => apiError(401, 'unauthenticated'),
      'POST /auth/register': () =>
        apiError(422, 'validation_error', 'bad', { fields: { email: 'Enter a valid email address.', password: 'Password must be 12-128 characters.' } }),
    })
    render(<App />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Create an account' }))
    expect(screen.getByRole('heading', { name: 'Create your workspace' })).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByText('Use 12 to 128 characters.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email'), 'nope')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/12 to 128.*12-128/)
  })

  it('registration success lands in the new workspace', async () => {
    installFetch({
      'GET /auth/me': () => apiError(401, 'unauthenticated'),
      'POST /auth/register': () => json(201, authResponse('new')),
      'GET /workspace': () => json(200, workspaceEnvelope('My workspace', 1, SECTIONS)),
    })
    render(<App />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Create an account' }))
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'My workspace' })).toBeInTheDocument()
  })
})

describe('signed in', () => {
  const signedInHandlers = {
    'GET /auth/me': () => json(200, authResponse('a')),
    'GET /workspace': () => json(200, workspaceEnvelope('Ada workspace', 2, SECTIONS)),
    'POST /auth/logout': () => noContent(),
  }

  it('restores an existing session on load', async () => {
    installFetch(signedInHandlers)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Ada workspace' })).toBeInTheDocument()
  })

  it('log out returns to sign-in and removes the private workspace from the page', async () => {
    const { calls } = installFetch(signedInHandlers)
    render(<App />)
    await screen.findByRole('heading', { name: 'Ada workspace' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument()
    expect(screen.queryByText('Ada workspace')).not.toBeInTheDocument()
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/auth/logout' })
    expect(calls.at(-1)?.headers['X-CSRF-Token']).toBe('csrf-a')
  })

  it('shows a loading status, then an error with retry that recovers', async () => {
    let attempt = 0
    const first = deferred<Response>()
    installFetch({
      ...signedInHandlers,
      'GET /workspace': () => (attempt++ === 0 ? first.promise : json(200, workspaceEnvelope('Recovered'))),
    })
    render(<App />)
    expect(await screen.findByText('Loading your workspace…')).toBeInTheDocument()
    first.resolve(apiError(500, 'internal_error'))
    expect(await screen.findByRole('alert')).toHaveTextContent('The server had a problem')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Recovered' })).toBeInTheDocument()
  })

  it('explains an incompatible newer workspace and offers no retry', async () => {
    installFetch({
      ...signedInHandlers,
      'GET /workspace': () => json(200, { id: 'w', revision: 1, updatedAt: 'x', config: { schemaVersion: 9, title: 'Future' } }),
    })
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('newer version')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('an expired session returns to sign-in with an explanation', async () => {
    installFetch({ ...signedInHandlers, 'GET /workspace': () => apiError(401, 'unauthenticated') })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Your session expired')
  })

  it('switching accounts never shows the previous user\'s workspace', async () => {
    const slowA = deferred<Response>()
    let loads = 0
    installFetch({
      'GET /auth/me': () => apiError(401, 'unauthenticated'),
      'POST /auth/login': ({ body }) => json(200, authResponse((body as { email: string }).email.startsWith('a') ? 'a' : 'b')),
      'GET /workspace': () => (loads++ === 0 ? slowA.promise : json(200, workspaceEnvelope('Bea workspace'))),
      'POST /auth/logout': () => noContent(),
    })
    render(<App />)
    await screen.findByLabelText('Email')
    await fillAndSubmit('a@example.com', PASSWORD, 'Sign in')
    await screen.findByRole('button', { name: 'Log out' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))
    await screen.findByLabelText('Email')
    await fillAndSubmit('b@example.com', PASSWORD, 'Sign in')
    expect(await screen.findByRole('heading', { name: 'Bea workspace' })).toBeInTheDocument()

    slowA.resolve(json(200, workspaceEnvelope('Ada workspace')))
    await waitFor(() => expect(screen.getByTestId('current-user')).toHaveTextContent('b@example.com'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByText('Ada workspace')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bea workspace' })).toBeInTheDocument()
  })
})

describe('server unavailable', () => {
  it('offers a retry when the backend cannot be reached at startup', async () => {
    let up = false
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (!up) throw new TypeError('down')
      return String(input).endsWith('/auth/me') ? apiError(401, 'unauthenticated') : json(200, {})
    }))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    up = true
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument()
  })
})
