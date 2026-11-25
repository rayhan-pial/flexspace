import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setWorkspaceTitle } from '../../domain/workspace/commands'
import { apiError, deferred, installFetch, json } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from './editorStore'
import { reloadLatest, saveDraft } from './workspaceSync'

const editor = () => useEditorStore.getState()
const session = () => useSessionStore.getState()
const dirty = () => selectIsDirty(editor())
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const edit = (title: string) => editor().apply(setWorkspaceTitle(title))
const PASSWORD = 'correct horse battery'

let server: FakeServer

async function signIn(email = 'a@example.com') {
  await session().login(email, PASSWORD)
  await flush()
}

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  server = createFakeServer()
  installFetch(server.handlers)
})
afterEach(() => vi.unstubAllGlobals())

describe('Save', () => {
  it('sends the base revision, the immutable snapshot and the CSRF token, then advances the baseline', async () => {
    await signIn()
    edit('Renamed')
    await saveDraft()
    expect(server.puts).toHaveLength(1)
    expect(server.puts[0]).toMatchObject({ baseRevision: 1, csrf: 'csrf-a' })
    expect((server.puts[0].config as { title: string }).title).toBe('Renamed')
    expect(editor()).toMatchObject({ revision: 2, saveStatus: { state: 'idle' } })
    expect(editor().savedConfig!.title).toBe('Renamed')
    expect(dirty()).toBe(false)
  })

  it('does nothing when there is nothing to save', async () => {
    await signIn()
    await saveDraft()
    expect(server.puts).toHaveLength(0)
  })

  it('blocks duplicate saves while one is in flight', async () => {
    await signIn()
    edit('Renamed')
    const gate = deferred<Response>()
    server.putHook = () => gate.promise
    const first = saveDraft()
    const second = saveDraft()
    await flush()
    expect(server.puts).toHaveLength(1)
    gate.resolve(json(200, { id: 'ws-a', revision: 2, updatedAt: 'x', config: editor().draftConfig }))
    await Promise.all([first, second])
    expect(server.puts).toHaveLength(1)
  })

  it('a saved change survives a fresh page load, and Cancel restores it', async () => {
    await signIn()
    edit('Persisted title')
    await saveDraft()

    // Simulate a page reload: all in-memory state is gone, the server session cookie remains.
    useSessionStore.setState(useSessionStore.getInitialState(), true)
    useEditorStore.setState(useEditorStore.getInitialState(), true)
    await session().bootstrap()
    await flush()
    expect(editor().draftConfig!.title).toBe('Persisted title')
    expect(editor().revision).toBe(2)

    edit('Throwaway')
    expect(editor().cancel()).toBe(true)
    expect(editor().draftConfig!.title).toBe('Persisted title')
    expect(server.puts).toHaveLength(1) // the canceled edit never reached the server
  })

  it('keeps edits made during a delayed save and leaves them dirty afterwards', async () => {
    await signIn()
    edit('Submitted')
    const gate = deferred<Response>()
    server.putHook = () => gate.promise
    const saving = saveDraft()
    await flush()
    edit('Typed while saving')
    server.commit('a', server.puts[0]) // the server applies the submitted snapshot, then answers
    gate.resolve(json(200, { id: 'ws-a', revision: 2, updatedAt: 'x', config: server.puts[0].config }))
    await saving
    expect((server.puts[0].config as { title: string }).title).toBe('Submitted') // snapshot, not the later edit
    expect(editor().savedConfig!.title).toBe('Submitted')
    expect(editor().draftConfig!.title).toBe('Typed while saving')
    expect(dirty()).toBe(true)
    expect(editor().revision).toBe(2)

    server.putHook = undefined
    await saveDraft()
    expect(server.puts[1]).toMatchObject({ baseRevision: 2 })
    expect(dirty()).toBe(false)
  })
})

describe('conflict (409)', () => {
  it('never replaces the draft, and offers reload only on explicit request', async () => {
    await signIn()
    edit('My edit')
    server.changeElsewhere('a', (c) => { c.title = 'Their edit' })
    const getsBefore = server.gets
    await saveDraft()
    expect(editor().saveStatus).toMatchObject({ state: 'error', kind: 'conflict', currentRevision: 2 })
    expect(editor().draftConfig!.title).toBe('My edit')
    expect(editor().revision).toBe(1)
    expect(dirty()).toBe(true)
    expect(server.gets).toBe(getsBefore) // no silent refetch/merge

    expect(await reloadLatest()).toEqual({ ok: true })
    expect(editor().draftConfig!.title).toBe('Their edit')
    expect(editor()).toMatchObject({ revision: 2, saveStatus: { state: 'idle' } })
    expect(dirty()).toBe(false)
  })

  it('keeping the edits and saving again conflicts again instead of overwriting', async () => {
    await signIn()
    edit('My edit')
    server.changeElsewhere('a', (c) => { c.title = 'Their edit' })
    await saveDraft()
    editor().dismissSaveError()
    await saveDraft()
    expect(editor().saveStatus).toMatchObject({ kind: 'conflict' })
    expect((server.users.a.config as { title: string }).title).toBe('Their edit')
  })

  it('reload is refused while a save is in flight', async () => {
    await signIn()
    edit('x')
    const gate = deferred<Response>()
    server.putHook = () => gate.promise
    const saving = saveDraft()
    await flush()
    expect(await reloadLatest()).toMatchObject({ ok: false })
    gate.resolve(json(200, { id: 'ws-a', revision: 2, updatedAt: 'x', config: server.puts[0].config }))
    await saving
  })
})

describe('failures keep the draft and allow retry', () => {
  it.each([
    [422, 'invalid_config', 'validation'],
    [413, 'payload_too_large', 'too_large'],
    [403, 'csrf_failed', 'server'],
  ] as const)('HTTP %i is reported as %s without losing edits', async (status, code, kind) => {
    await signIn()
    edit('Keep me')
    server.putHook = () => apiError(status, code, 'rejected')
    await saveDraft()
    expect(editor().saveStatus).toMatchObject({ state: 'error', kind })
    expect(editor().draftConfig!.title).toBe('Keep me')
    expect(dirty()).toBe(true)
    server.putHook = undefined
    await saveDraft()
    expect(dirty()).toBe(false)
  })

  it('an unreadable success response is treated as a failure', async () => {
    await signIn()
    edit('Keep me')
    server.putHook = () => json(200, { id: 'w', revision: 2, updatedAt: 'x', config: { schemaVersion: 1 } })
    await saveDraft()
    expect(editor().saveStatus).toMatchObject({ state: 'error', kind: 'server' })
    expect(editor().revision).toBe(1)
  })
})

describe('response lost after the server may have committed', () => {
  it('a dropped connection after commit is reconciled as a success', async () => {
    await signIn()
    edit('Committed anyway')
    server.putHook = () => 'commit-then-drop'
    const getsBefore = server.gets
    await saveDraft()
    expect(server.gets).toBe(getsBefore + 1) // fetched the saved document to compare
    expect(editor()).toMatchObject({ revision: 2, saveStatus: { state: 'idle' } })
    expect(editor().savedConfig!.title).toBe('Committed anyway')
    expect(dirty()).toBe(false)
  })

  it('a gateway error after commit is reconciled the same way', async () => {
    await signIn()
    edit('Committed anyway')
    server.putHook = () => 'commit-then-500'
    await saveDraft()
    expect(editor()).toMatchObject({ revision: 2, saveStatus: { state: 'idle' } })
    expect(dirty()).toBe(false)
  })

  it('a dropped connection with nothing committed is a retryable network failure', async () => {
    await signIn()
    edit('Not committed')
    server.putHook = () => 'drop'
    await saveDraft()
    expect(editor().saveStatus).toMatchObject({ state: 'error', kind: 'network' })
    expect(editor().revision).toBe(1)
    expect(dirty()).toBe(true)
    server.putHook = undefined
    await saveDraft()
    expect(editor()).toMatchObject({ revision: 2, saveStatus: { state: 'idle' } })
  })

  it('a 5xx with nothing committed is a retryable server failure', async () => {
    await signIn()
    edit('x')
    server.putHook = () => apiError(500, 'internal_error')
    await saveDraft()
    expect(editor().saveStatus).toMatchObject({ state: 'error', kind: 'server' })
    expect(editor().revision).toBe(1)
  })

  it('someone else saving while the response was lost is reported as a conflict, not success', async () => {
    await signIn()
    edit('Mine')
    server.putHook = () => {
      server.changeElsewhere('a', (c) => { c.title = 'Theirs' })
      return 'drop'
    }
    await saveDraft()
    expect(editor().saveStatus).toMatchObject({ state: 'error', kind: 'conflict', currentRevision: 2 })
    expect(editor().draftConfig!.title).toBe('Mine')
    expect(editor().revision).toBe(1)
  })

  it('if the reconciliation fetch also fails, it says the outcome is unknown', async () => {
    await signIn()
    edit('Unknown outcome')
    server.putHook = () => 'drop'
    server.getHook = () => { throw new TypeError('still offline') }
    await saveDraft()
    expect(editor().saveStatus).toMatchObject({ state: 'error', kind: 'network', message: expect.stringContaining("Couldn't confirm") })
    expect(dirty()).toBe(true)
  })
})

describe('session expiry during editing', () => {
  async function expireDuringSave() {
    await signIn()
    edit('Unsaved work')
    server.expireSession()
    await saveDraft()
  }

  it('hides the workspace behind sign-in and freezes the owner\'s draft in memory', async () => {
    await expireDuringSave()
    expect(session()).toMatchObject({ status: 'reauth', csrfToken: null, user: { id: 'a' } })
    expect(editor().frozen).toBe(true)
    expect(editor().draftConfig!.title).toBe('Unsaved work')
    expect(edit('More')).toMatchObject({ status: 'rejected' })
    expect(editor().beginSave()).toBeNull()
    expect(editor().cancel()).toBe(false)
    expect(await reloadLatest()).toMatchObject({ ok: false })
    expect(editor().draftConfig!.title).toBe('Unsaved work')
  })

  it('signing back in as the same account resumes the draft', async () => {
    await expireDuringSave()
    await session().login('a@example.com', PASSWORD)
    await flush()
    expect(session().status).toBe('authenticated')
    expect(editor()).toMatchObject({ frozen: false, ownerId: 'a', saveStatus: { state: 'idle' } })
    expect(editor().draftConfig!.title).toBe('Unsaved work')
    expect(dirty()).toBe(true)
    await saveDraft()
    expect(server.puts.at(-1)).toMatchObject({ baseRevision: 1 })
    expect(dirty()).toBe(false)
  })

  it('same account, but the workspace changed meanwhile: resume with a conflict, never overwrite', async () => {
    await expireDuringSave()
    server.changeElsewhere('a', (c) => { c.title = 'Changed while signed out' })
    await session().login('a@example.com', PASSWORD)
    await flush()
    expect(editor().frozen).toBe(false)
    expect(editor().saveStatus).toMatchObject({ state: 'error', kind: 'conflict', currentRevision: 2 })
    expect(editor().draftConfig!.title).toBe('Unsaved work')
    await saveDraft()
    expect((server.users.a.config as { title: string }).title).toBe('Changed while signed out')
  })

  it('a different account clears the frozen draft before rendering its own workspace', async () => {
    await expireDuringSave()
    await session().login('b@example.com', PASSWORD)
    expect(editor().draftConfig).toBeNull() // cleared immediately, before B's workspace arrives
    await flush()
    expect(session()).toMatchObject({ status: 'authenticated', user: { id: 'b' } })
    expect(editor()).toMatchObject({ ownerId: 'b', frozen: false, draftConfig: { title: 'Original B' } })
    expect(JSON.stringify(editor().draftConfig)).not.toContain('Unsaved work')
  })

  it('discarding the frozen draft returns to a clean sign-in', async () => {
    await expireDuringSave()
    session().discardFrozenDraft()
    expect(session().status).toBe('anonymous')
    expect(editor()).toMatchObject({ ownerId: null, draftConfig: null, frozen: false })
  })

  it('a 401 on the reconciliation fetch also freezes the draft', async () => {
    await signIn()
    edit('Unsaved work')
    server.putHook = () => {
      server.expireSession()
      return 'drop'
    }
    await saveDraft()
    expect(session().status).toBe('reauth')
    expect(editor().draftConfig!.title).toBe('Unsaved work')
  })

  it('a 401 while reloading freezes the draft instead of losing it', async () => {
    await signIn()
    edit('Unsaved work')
    server.expireSession()
    expect(await reloadLatest()).toMatchObject({ ok: false })
    expect(session().status).toBe('reauth')
    expect(editor().draftConfig!.title).toBe('Unsaved work')
  })

  it('a clean workspace also freezes (private state is hidden either way)', async () => {
    await signIn()
    server.expireSession()
    await reloadLatest()
    expect(session().status).toBe('reauth')
    expect(editor().frozen).toBe(true)
  })
})

describe('late save results for another owner or session', () => {
  it('a save result arriving after logout and a different login is ignored', async () => {
    await signIn()
    edit('A edit')
    const gate = deferred<Response>()
    server.putHook = () => gate.promise
    const saving = saveDraft()
    await flush()
    await session().logout()
    await signIn('b@example.com')
    expect(editor()).toMatchObject({ ownerId: 'b', revision: 1 })
    gate.resolve(json(200, { id: 'ws-a', revision: 2, updatedAt: 'x', config: server.puts[0].config }))
    await saving
    expect(editor()).toMatchObject({ ownerId: 'b', revision: 1, saveStatus: { state: 'idle' } })
    expect(editor().savedConfig!.title).toBe('Original B')
  })

  it('a save failure arriving after logout does not freeze or alter anything', async () => {
    await signIn()
    edit('A edit')
    const gate = deferred<Response>()
    server.putHook = () => gate.promise
    const saving = saveDraft()
    await flush()
    await session().logout()
    gate.resolve(apiError(401, 'unauthenticated'))
    await saving
    expect(session().status).toBe('anonymous')
    expect(editor()).toMatchObject({ ownerId: null, draftConfig: null, frozen: false })
  })

  it('a reload result arriving after logout is ignored', async () => {
    await signIn()
    const gate = deferred<Response>()
    server.getHook = () => gate.promise
    const reloading = reloadLatest()
    await flush()
    await session().logout()
    gate.resolve(json(200, { id: 'ws-a', revision: 9, updatedAt: 'x', config: server.users.a.config }))
    expect(await reloading).toMatchObject({ ok: false })
    expect(editor().draftConfig).toBeNull()
  })
})

describe('browser storage', () => {
  it('saving, failing, freezing and resuming never touch web storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await signIn()
    edit('x')
    await saveDraft()
    edit('y')
    server.expireSession()
    await saveDraft()
    await session().login('a@example.com', PASSWORD)
    await flush()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })
})

describe('Reload latest locks the draft while the request is in flight (UI-019)', () => {
  it('refuses edits, undo, save, cancel and gestures until the GET settles, then the newest remote is shown honestly', async () => {
    await signIn()
    edit('Local one')
    const gate = deferred<Response>()
    server.getHook = () => gate.promise
    const reloading = reloadLatest()
    await flush()
    expect(editor().reloading).toBe(true)
    expect(edit('New edit AFTER confirming reload')).toMatchObject({ status: 'rejected' })
    expect(editor().draftConfig!.title).toBe('Local one')
    expect(editor().undo()).toBe(false)
    expect(editor().cancel()).toBe(false)
    expect(editor().beginSave()).toBeNull()
    expect(editor().beginGesture('grid')).toBe(false)
    expect(await reloadLatest()).toMatchObject({ ok: false }) // no second concurrent reload
    gate.resolve(json(200, { id: 'ws-a', revision: 1, updatedAt: 'x', config: server.users.a.config }))
    expect(await reloading).toEqual({ ok: true })
    expect(editor().reloading).toBe(false)
    expect(dirty()).toBe(false)
    expect(edit('Editing resumes')).toMatchObject({ status: 'applied' })
  })

  it('a failed reload unlocks and keeps the draft recoverable', async () => {
    await signIn()
    edit('Keep me')
    const gate = deferred<Response>()
    server.getHook = () => gate.promise
    const reloading = reloadLatest()
    await flush()
    gate.resolve(apiError(500, 'server_error'))
    expect(await reloading).toMatchObject({ ok: false })
    expect(editor().reloading).toBe(false)
    expect(editor().draftConfig!.title).toBe('Keep me')
    expect(edit('Keep me, more')).toMatchObject({ status: 'applied' })
  })

  it('an owner switch while pending ignores the late result and leaves no stale lock', async () => {
    await signIn()
    const gate = deferred<Response>()
    server.getHook = () => gate.promise
    const reloading = reloadLatest()
    await flush()
    await session().logout()
    expect(editor().reloading).toBe(false)
    server.getHook = undefined
    await signIn('b@example.com')
    const bTitle = editor().draftConfig!.title
    gate.resolve(json(200, { id: 'ws-a', revision: 9, updatedAt: 'x', config: server.users.a.config }))
    expect(await reloading).toMatchObject({ ok: false })
    expect(editor().ownerId).not.toBeNull()
    expect(editor().draftConfig!.title).toBe(bTitle)
    expect(editor().reloading).toBe(false)
  })
})
