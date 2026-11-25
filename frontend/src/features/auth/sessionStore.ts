import { create } from 'zustand'
import * as authApi from '../../api/auth'
import type { AuthUser } from '../../api/auth'
import { ApiError } from '../../api/client'
import { getWorkspace } from '../../api/workspace'
import { deepEqual } from '../../domain/workspace/immutable'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { useEditorStore } from '../editor/editorStore'

export type WorkspaceLoad =
  | { status: 'idle' }
  | { status: 'loading' }
  /** The data itself lives in the editor store (saved baseline + draft). */
  | { status: 'ready' }
  | { status: 'error'; code: string; message: string }

export type FieldErrors = { email?: string; password?: string }

export type AuthResult =
  | { ok: true }
  /** `superseded`: a newer auth action replaced this one, so the form must ignore the result. */
  | { ok: false; superseded: true }
  | { ok: false; superseded?: false; message: string; fields?: FieldErrors }

export interface SessionState {
  /**
   * `reauth`: the session expired while a workspace was open. The owner's draft stays frozen in
   * memory (the workspace itself is hidden) until the same account signs in again; a different
   * account clears it.
   */
  status: 'bootstrapping' | 'anonymous' | 'authenticated' | 'reauth' | 'unavailable' | 'signing_out' | 'signout_failed'
  user: AuthUser | null
  /** In memory only: never written to localStorage/sessionStorage/IndexedDB. */
  csrfToken: string | null
  /**
   * Auth generation. Every login/register/logout/bootstrap starts a new one; an async result is
   * applied only if its generation is still current, so late responses from a previous
   * account or attempt can never populate the current one.
   */
  generation: number
  notice: string | null
  workspace: WorkspaceLoad
  bootstrap: () => Promise<void>
  login: (email: string, password: string) => Promise<AuthResult>
  register: (email: string, password: string) => Promise<AuthResult>
  /**
   * Ends the server session. Private content is hidden at once (`signing_out`). Only a confirmed
   * revocation (success, or the server saying the session is already gone) ends in `anonymous`;
   * any other outcome is `signout_failed`, from which `retryLogout` tries again.
   */
  logout: () => Promise<void>
  retryLogout: () => Promise<void>
  /** Why the last sign-out could not be confirmed (generic text, never a token). */
  signOutError: string | null
  loadWorkspace: () => Promise<void>
  /** Call when any authenticated request returns 401. */
  handleUnauthorized: () => void
  /** Give up on a frozen draft (user chose to discard it) and return to a clean sign-in. */
  discardFrozenDraft: () => void
}

const SIGNED_OUT = { user: null, csrfToken: null, workspace: { status: 'idle' } } as const

/** Drop any owner-bound editor state (draft, saved baseline, selection, history). */
const resetEditor = () => useEditorStore.getState().reset()

function describeAuthError(error: unknown, mode: 'login' | 'register'): { message: string; fields?: FieldErrors } {
  if (!(error instanceof ApiError)) return { message: 'Something went wrong. Please try again.' }
  switch (error.code) {
    case 'invalid_credentials':
      return { message: 'Email or password is incorrect.' }
    case 'email_taken':
      return { message: 'An account with this email already exists.', fields: { email: 'This email is already registered.' } }
    case 'network_error':
      return { message: error.message }
    case 'origin_not_allowed':
      return { message: 'This address is not allowed to sign in. Open the app from its configured address.' }
    case 'validation_error': {
      const fields = (error.details.fields ?? {}) as FieldErrors
      if (mode === 'register' && (fields.email || fields.password)) return { message: 'Please fix the highlighted fields.', fields }
      return { message: 'Check your email and password and try again.' }
    }
    default:
      return { message: error.status >= 500 ? 'The server had a problem. Please try again.' : error.message }
  }
}

export const useSessionStore = create<SessionState>()((set, get) => {
  /** Start a new auth generation, invalidating everything still in flight. */
  const begin = () => {
    const generation = get().generation + 1
    set({ generation })
    return generation
  }
  const isCurrent = (generation: number) => get().generation === generation
  /** The CSRF token of the session being signed out, kept out of state so Retry can reuse it. */
  let logoutCsrf: string | null = null
  let logoutInFlight: Promise<void> | null = null

  /** One revocation attempt. Fenced by `generation`: a result for a superseded attempt changes nothing. */
  async function revoke(): Promise<void> {
    const generation = begin()
    set({ status: 'signing_out', signOutError: null, notice: null, ...SIGNED_OUT })
    try {
      await authApi.logout(logoutCsrf)
    } catch (error) {
      if (!isCurrent(generation)) return
      // A 401 means the session is already gone, which is exactly what sign-out wants.
      if (!(error instanceof ApiError && error.status === 401)) {
        const message = error instanceof ApiError && error.status > 0 && error.status < 500
          ? 'The server did not accept the sign-out request.'
          : "Couldn't reach the server to confirm that you were signed out."
        set({ status: 'signout_failed', signOutError: message })
        return
      }
    }
    if (!isCurrent(generation)) return
    logoutCsrf = null
    set({ status: 'anonymous', notice: null, signOutError: null, ...SIGNED_OUT })
  }

  async function authenticate(mode: 'login' | 'register', email: string, password: string): Promise<AuthResult> {
    const generation = begin()
    try {
      const response = await (mode === 'login' ? authApi.login : authApi.register)(email, password)
      if (!isCurrent(generation)) return { ok: false, superseded: true }
      const editor = useEditorStore.getState()
      const resuming = get().status === 'reauth' && editor.frozen && editor.ownerId === response.user.id
      if (resuming) {
        // Same account signing back in: keep its frozen draft and check the server revision.
        set({ status: 'authenticated', user: response.user, csrfToken: response.csrfToken, notice: null })
        void resumeAfterReauth(generation, response.user)
      } else {
        resetEditor() // a different account (or a normal sign-in) never inherits another owner's draft
        set({ status: 'authenticated', user: response.user, csrfToken: response.csrfToken, notice: null, workspace: { status: 'idle' } })
        void get().loadWorkspace()
      }
      return { ok: true }
    } catch (error) {
      if (!isCurrent(generation)) return { ok: false, superseded: true }
      return { ok: false, ...describeAuthError(error, mode) }
    }
  }

  /** After re-login as the same owner: unfreeze, and surface a conflict if the server moved on. */
  async function resumeAfterReauth(generation: number, user: AuthUser) {
    const stillOwner = () => isCurrent(generation) && get().user?.id === user.id && useEditorStore.getState().ownerId === user.id
    try {
      const envelope = await getWorkspace()
      if (!stillOwner()) return
      const editor = useEditorStore.getState()
      editor.unfreeze()
      const parsed = parseWorkspaceConfig(envelope.config)
      const changed = envelope.revision !== editor.revision || (parsed.ok && !deepEqual(parsed.config, editor.savedConfig))
      if (changed) {
        editor.reportFailure({
          kind: 'conflict',
          message: 'This workspace was changed in another tab or session while you were signed out.',
          currentRevision: envelope.revision,
        })
      }
    } catch (error) {
      if (!stillOwner()) return
      if (error instanceof ApiError && error.status === 401) {
        get().handleUnauthorized()
        return
      }
      // Could not verify; the server still rejects a stale save with a conflict, so resume.
      useEditorStore.getState().unfreeze()
    }
  }

  return {
    status: 'bootstrapping',
    user: null,
    csrfToken: null,
    generation: 0,
    notice: null,
    signOutError: null,
    workspace: { status: 'idle' },

    async bootstrap() {
      const generation = begin()
      set({ status: 'bootstrapping' })
      try {
        const response = await authApi.me()
        if (!isCurrent(generation)) return
        resetEditor()
        set({ status: 'authenticated', user: response.user, csrfToken: response.csrfToken, workspace: { status: 'idle' } })
        void get().loadWorkspace()
      } catch (error) {
        if (!isCurrent(generation)) return
        resetEditor()
        if (error instanceof ApiError && error.status === 401) set({ status: 'anonymous', ...SIGNED_OUT })
        else set({ status: 'unavailable', ...SIGNED_OUT })
      }
    },

    login: (email, password) => authenticate('login', email, password),
    register: (email, password) => authenticate('register', email, password),

    logout() {
      if (get().status === 'signing_out' && logoutInFlight) return logoutInFlight // duplicate activation
      if (get().status === 'signout_failed') return get().retryLogout()
      if (!get().csrfToken) {
        // Nothing signed in is known here (e.g. still bootstrapping): just invalidate whatever is in flight.
        begin()
        resetEditor()
        set({ status: 'anonymous', notice: null, signOutError: null, ...SIGNED_OUT })
        return Promise.resolve()
      }
      logoutCsrf = get().csrfToken
      // Clear private state first so the previous user's data is never shown while or after signing out.
      resetEditor()
      logoutInFlight = revoke().finally(() => { logoutInFlight = null })
      return logoutInFlight
    },

    retryLogout() {
      if (get().status === 'signing_out' && logoutInFlight) return logoutInFlight
      if (get().status !== 'signout_failed') return Promise.resolve()
      logoutInFlight = revoke().finally(() => { logoutInFlight = null })
      return logoutInFlight
    },

    async loadWorkspace() {
      const { generation, user } = get()
      if (!user) return
      set({ workspace: { status: 'loading' } })
      // Apply only if the same sign-in is still active and belongs to the same owner.
      const stillOwner = () => isCurrent(generation) && get().user?.id === user.id
      try {
        const envelope = await getWorkspace()
        if (!stillOwner()) return
        const parsed = parseWorkspaceConfig(envelope.config)
        if (!parsed.ok) {
          const message =
            parsed.code === 'unsupported_schema_version'
              ? 'This workspace was saved by a newer version of FlexSpace and cannot be opened here.'
              : 'This workspace could not be read because its saved data is not valid.'
          set({ workspace: { status: 'error', code: parsed.code, message } })
          return
        }
        useEditorStore.getState().load({ ownerId: user.id, workspaceId: envelope.id, revision: envelope.revision, config: parsed.config })
        set({ workspace: { status: 'ready' } })
      } catch (error) {
        if (!stillOwner()) return
        if (error instanceof ApiError && error.status === 401) {
          get().handleUnauthorized()
          return
        }
        const message =
          error instanceof ApiError
            ? error.status >= 500
              ? 'The server had a problem loading your workspace.'
              : error.message
            : 'Could not load your workspace.'
        set({ workspace: { status: 'error', code: error instanceof ApiError ? error.code : 'unknown', message } })
      }
    },

    handleUnauthorized() {
      begin() // invalidate everything still in flight for the expired session
      const editor = useEditorStore.getState()
      if (editor.ownerId && editor.draftConfig) {
        // Hide the workspace and freeze the owner's draft in memory; never touch browser storage.
        editor.freeze()
        set({ status: 'reauth', csrfToken: null, notice: 'Your session expired. Sign in to continue.' })
      } else {
        resetEditor()
        set({ status: 'anonymous', notice: 'Your session expired. Please sign in again.', ...SIGNED_OUT })
      }
    },

    discardFrozenDraft() {
      begin()
      resetEditor()
      set({ status: 'anonymous', notice: null, ...SIGNED_OUT })
    },
  }
})
