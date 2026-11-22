import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apiError, authResponse, deferred, installFetch, json, noContent, workspaceEnvelope,
} from '../../test/fakeApi'
import { useEditorStore } from '../editor/editorStore'
import { useSessionStore } from './sessionStore'

const store = () => useSessionStore.getState()
const editor = () => useEditorStore.getState()
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
})
afterEach(() => vi.unstubAllGlobals())

describe('bootstrap', () => {
  it('signs in from an existing session and loads that user\'s workspace', async () => {
    installFetch({
      'GET /auth/me': () => json(200, authResponse('a')),
      'GET /workspace': () => json(200, workspaceEnvelope('A workspace', 3)),
    })
    await store().bootstrap()
    await flush()
    expect(store()).toMatchObject({ status: 'authenticated', user: { id: 'a' }, csrfToken: 'csrf-a' })
    expect(store().workspace).toEqual({ status: 'ready' })
    expect(editor()).toMatchObject({ ownerId: 'a', revision: 3, savedConfig: { title: 'A workspace' }, draftConfig: { title: 'A workspace' } })
  })

  it('is anonymous on 401 and unavailable when the server cannot be reached', async () => {
    installFetch({ 'GET /auth/me': () => apiError(401, 'unauthenticated') })
    await store().bootstrap()
    expect(store().status).toBe('anonymous')

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')))
    await store().bootstrap()
    expect(store().status).toBe('unavailable')
  })

  it('ignores a /auth/me response that arrives after logout', async () => {
    const me = deferred<Response>()
    installFetch({
      'GET /auth/me': () => me.promise,
      'GET /workspace': () => json(200, workspaceEnvelope('A workspace')),
      'POST /auth/logout': () => noContent(),
    })
    const booting = store().bootstrap()
    await store().logout()
    me.resolve(json(200, authResponse('a')))
    await booting
    await flush()
    expect(store()).toMatchObject({ status: 'anonymous', user: null, csrfToken: null, workspace: { status: 'idle' } })
  })
})

describe('login and register', () => {
  it('login success stores user and csrf in memory and loads the workspace', async () => {
    const { calls } = installFetch({
      'POST /auth/login': () => json(200, authResponse('a')),
      'GET /workspace': () => json(200, workspaceEnvelope('A workspace')),
    })
    expect(await store().login('a@example.com', 'correct horse battery')).toEqual({ ok: true })
    await flush()
    expect(calls[0].body).toEqual({ email: 'a@example.com', password: 'correct horse battery' })
    expect(store()).toMatchObject({ status: 'authenticated', csrfToken: 'csrf-a', workspace: { status: 'ready' } })
  })

  it('failed login is understandable and leaves the app signed out', async () => {
    installFetch({ 'POST /auth/login': () => apiError(401, 'invalid_credentials', 'Invalid email or password.') })
    const result = await store().login('a@example.com', 'wrong password!!')
    expect(result).toEqual({ ok: false, message: 'Email or password is incorrect.' })
    expect(store()).toMatchObject({ user: null, csrfToken: null })
    expect(store().status).not.toBe('authenticated')
  })

  it('maps register validation and duplicate-email errors to fields', async () => {
    installFetch({
      'POST /auth/register': ({ body }) =>
        (body as { email: string }).email === 'taken@example.com'
          ? apiError(409, 'email_taken')
          : apiError(422, 'validation_error', 'bad', { fields: { email: 'Enter a valid email address.', password: 'Password must be 12-128 characters.' } }),
    })
    const invalid = await store().register('nope', 'short')
    expect(invalid).toMatchObject({ ok: false, fields: { email: 'Enter a valid email address.', password: 'Password must be 12-128 characters.' } })
    const taken = await store().register('taken@example.com', 'correct horse battery')
    expect(taken).toMatchObject({ ok: false, message: 'An account with this email already exists.', fields: { email: expect.any(String) } })
  })

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')))
    expect(await store().login('a@example.com', 'correct horse battery')).toMatchObject({ ok: false, message: expect.stringContaining("Can't reach") })
  })
})

describe('late responses from a previous account or attempt', () => {
  it('a delayed workspace for user A never populates user B', async () => {
    const workspaceA = deferred<Response>()
    let workspaceCalls = 0
    installFetch({
      'POST /auth/login': ({ body }) => json(200, authResponse((body as { email: string }).email === 'a@example.com' ? 'a' : 'b')),
      'GET /workspace': () => (workspaceCalls++ === 0 ? workspaceA.promise : json(200, workspaceEnvelope('B workspace'))),
      'POST /auth/logout': () => noContent(),
    })

    await store().login('a@example.com', 'correct horse battery')
    expect(store().workspace.status).toBe('loading') // A's workspace still in flight
    await store().logout()
    await store().login('b@example.com', 'correct horse battery')
    await flush()
    expect(editor()).toMatchObject({ ownerId: 'b', draftConfig: { title: 'B workspace' } })

    workspaceA.resolve(json(200, workspaceEnvelope('A workspace')))
    await flush()
    expect(store().user?.id).toBe('b')
    expect(store().workspace).toEqual({ status: 'ready' })
    expect(editor()).toMatchObject({ ownerId: 'b', savedConfig: { title: 'B workspace' }, draftConfig: { title: 'B workspace' } })
  })

  it('a delayed workspace after logout is discarded', async () => {
    const workspace = deferred<Response>()
    installFetch({
      'POST /auth/login': () => json(200, authResponse('a')),
      'GET /workspace': () => workspace.promise,
      'POST /auth/logout': () => noContent(),
    })
    await store().login('a@example.com', 'correct horse battery')
    await store().logout()
    workspace.resolve(json(200, workspaceEnvelope('A workspace')))
    await flush()
    expect(store().workspace).toEqual({ status: 'idle' })
    expect(store().user).toBeNull()
  })

  it('a slower, older login response is superseded by a newer one', async () => {
    const slow = deferred<Response>()
    installFetch({
      'POST /auth/login': ({ body }) =>
        (body as { email: string }).email === 'a@example.com' ? slow.promise : json(200, authResponse('b')),
      'GET /workspace': () => json(200, workspaceEnvelope('B workspace')),
    })
    const first = store().login('a@example.com', 'correct horse battery')
    expect(await store().login('b@example.com', 'correct horse battery')).toEqual({ ok: true })
    slow.resolve(json(200, authResponse('a')))
    expect(await first).toEqual({ ok: false, superseded: true })
    await flush()
    expect(store().user?.id).toBe('b')
    expect(store().csrfToken).toBe('csrf-b')
  })

  it('a late failure from a superseded attempt does not surface an error', async () => {
    const slow = deferred<Response>()
    installFetch({
      'POST /auth/login': ({ body }) =>
        (body as { email: string }).email === 'a@example.com' ? slow.promise : json(200, authResponse('b')),
      'GET /workspace': () => json(200, workspaceEnvelope('B workspace')),
    })
    const first = store().login('a@example.com', 'correct horse battery')
    await store().login('b@example.com', 'correct horse battery')
    slow.resolve(apiError(401, 'invalid_credentials'))
    expect(await first).toEqual({ ok: false, superseded: true })
  })
})

describe('workspace loading', () => {
  async function signIn(workspace: () => Response) {
    installFetch({
      'POST /auth/login': () => json(200, authResponse('a')),
      'GET /workspace': workspace,
    })
    await store().login('a@example.com', 'correct horse battery')
    await flush()
  }

  it('an expired session returns to sign-in with a notice and clears private state', async () => {
    await signIn(() => apiError(401, 'unauthenticated'))
    expect(store()).toMatchObject({ status: 'anonymous', user: null, csrfToken: null, notice: expect.stringContaining('expired'), workspace: { status: 'idle' } })
  })

  it('a newer unsupported schema version is reported and not opened', async () => {
    await signIn(() => json(200, { id: 'w', revision: 1, updatedAt: 'x', config: { schemaVersion: 2, title: 'Future' } }))
    expect(store().workspace).toMatchObject({ status: 'error', code: 'unsupported_schema_version' })
  })

  it('invalid saved data is reported rather than replaced with defaults', async () => {
    await signIn(() => json(200, { id: 'w', revision: 1, updatedAt: 'x', config: { schemaVersion: 1 } }))
    expect(store().workspace).toMatchObject({ status: 'error', code: 'invalid_config' })
  })

  it('a server error can be retried', async () => {
    let attempt = 0
    await signIn(() => (attempt++ === 0 ? apiError(500, 'internal_error') : json(200, workspaceEnvelope('Recovered'))))
    expect(store().workspace).toMatchObject({ status: 'error' })
    await store().loadWorkspace()
    expect(store().workspace).toEqual({ status: 'ready' })
    expect(editor().draftConfig?.title).toBe('Recovered')
  })
})

describe('logout', () => {
  it('clears state immediately and sends the CSRF token', async () => {
    const logoutRequest = deferred<Response>()
    const { calls } = installFetch({
      'POST /auth/login': () => json(200, authResponse('a')),
      'GET /workspace': () => json(200, workspaceEnvelope('A workspace')),
      'POST /auth/logout': () => logoutRequest.promise,
    })
    await store().login('a@example.com', 'correct horse battery')
    await flush()
    const loggingOut = store().logout()
    expect(store()).toMatchObject({ status: 'anonymous', user: null, csrfToken: null, workspace: { status: 'idle' } })
    expect(calls.at(-1)?.headers['X-CSRF-Token']).toBe('csrf-a')
    logoutRequest.resolve(noContent())
    await loggingOut
  })

  it('still ends the local session if the server cannot be reached', async () => {
    installFetch({
      'POST /auth/login': () => json(200, authResponse('a')),
      'GET /workspace': () => json(200, workspaceEnvelope('A workspace')),
      'POST /auth/logout': () => Promise.reject(new TypeError('down')),
    })
    await store().login('a@example.com', 'correct horse battery')
    await flush()
    await store().logout()
    expect(store().status).toBe('anonymous')
  })
})

describe('browser storage', () => {
  it('never persists credentials, tokens or the workspace', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    installFetch({
      'POST /auth/login': () => json(200, authResponse('a')),
      'GET /workspace': () => json(200, workspaceEnvelope('A workspace')),
      'POST /auth/logout': () => noContent(),
    })
    await store().login('a@example.com', 'correct horse battery')
    await flush()
    await store().logout()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.length + sessionStorage.length).toBe(0)
    setItem.mockRestore()
  })
})

describe('editor store integration', () => {
  const handlers = (title = 'A workspace') => ({
    'POST /auth/login': () => json(200, authResponse('a')),
    'GET /workspace': () => json(200, workspaceEnvelope(title)),
    'POST /auth/logout': () => noContent(),
  })

  it('logout discards the draft, including unsaved edits', async () => {
    installFetch(handlers())
    await store().login('a@example.com', 'correct horse battery')
    await flush()
    editor().apply((c) => ({ ok: true, config: { ...c, title: 'Unsaved edit' } }))
    expect(editor().draftConfig?.title).toBe('Unsaved edit')
    await store().logout()
    expect(editor()).toMatchObject({ ownerId: null, savedConfig: null, draftConfig: null, selection: null })
  })

  it("a new sign-in never inherits the previous owner's unsaved draft", async () => {
    installFetch({
      ...handlers(),
      'POST /auth/login': ({ body }) => json(200, authResponse((body as { email: string }).email.startsWith('a') ? 'a' : 'b')),
      'GET /workspace': () => json(200, workspaceEnvelope('Fresh')),
    })
    await store().login('a@example.com', 'correct horse battery')
    await flush()
    editor().apply((c) => ({ ok: true, config: { ...c, title: 'A private draft' } }))
    await store().login('b@example.com', 'correct horse battery') // switches without an explicit logout
    expect(editor().draftConfig).toBeNull() // reset before B's workspace arrives
    await flush()
    expect(editor()).toMatchObject({ ownerId: 'b', draftConfig: { title: 'Fresh' } })
  })

  it('an expired session clears the editor state', async () => {
    installFetch({ ...handlers(), 'GET /workspace': () => apiError(401, 'unauthenticated') })
    await store().login('a@example.com', 'correct horse battery')
    await flush()
    expect(editor().draftConfig).toBeNull()
  })

  it('does not populate the editor from a response that arrived after logout', async () => {
    const workspace = deferred<Response>()
    installFetch({ ...handlers(), 'GET /workspace': () => workspace.promise })
    await store().login('a@example.com', 'correct horse battery')
    await store().logout()
    workspace.resolve(json(200, workspaceEnvelope('Late A')))
    await flush()
    expect(editor().draftConfig).toBeNull()
  })
})
