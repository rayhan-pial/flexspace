import { create } from 'zustand'
import * as authApi from '../../api/auth'
import type { AuthUser } from '../../api/auth'
import { ApiError } from '../../api/client'
import { getWorkspace } from '../../api/workspace'
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
  status: 'bootstrapping' | 'anonymous' | 'authenticated' | 'unavailable'
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
  logout: () => Promise<void>
  loadWorkspace: () => Promise<void>
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

  async function authenticate(mode: 'login' | 'register', email: string, password: string): Promise<AuthResult> {
    const generation = begin()
    try {
      const response = await (mode === 'login' ? authApi.login : authApi.register)(email, password)
      if (!isCurrent(generation)) return { ok: false, superseded: true }
      resetEditor() // never carry a previous owner's draft into a new sign-in
      set({ status: 'authenticated', user: response.user, csrfToken: response.csrfToken, notice: null, workspace: { status: 'idle' } })
      void get().loadWorkspace()
      return { ok: true }
    } catch (error) {
      if (!isCurrent(generation)) return { ok: false, superseded: true }
      return { ok: false, ...describeAuthError(error, mode) }
    }
  }

  return {
    status: 'bootstrapping',
    user: null,
    csrfToken: null,
    generation: 0,
    notice: null,
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

    async logout() {
      const csrf = get().csrfToken
      begin()
      // Clear private state first so the previous user's data is never shown after logout.
      resetEditor()
      set({ status: 'anonymous', notice: null, ...SIGNED_OUT })
      try {
        await authApi.logout(csrf)
      } catch {
        // Already signed out locally; an expired or unreachable session needs no further handling.
      }
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
          begin() // invalidate anything else still in flight for the expired session
          resetEditor()
          set({ status: 'anonymous', notice: 'Your session expired. Please sign in again.', ...SIGNED_OUT })
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
  }
})
