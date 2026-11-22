import { create } from 'zustand'
import type { Command } from '../../domain/workspace/commands'
import { deepEqual, deepFreeze } from '../../domain/workspace/immutable'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import type { WorkspaceConfig } from '../../domain/workspace/types'

/*
 * Editor domain state (docs/architecture.md section 6). The saved baseline and the draft are the
 * only copies of the workspace; components read them through selectors and change the draft only
 * through `apply(command)`. Nothing here is persisted to browser storage.
 */

export type Mode = 'edit' | 'preview'
export type Selection = { kind: 'section' | 'widget' | 'navItem'; id: string }
export type GestureKind = 'grid' | 'sort'

export type SaveFailure =
  | { kind: 'conflict'; message: string; currentRevision: number }
  | { kind: 'validation' | 'too_large' | 'network' | 'unauthenticated' | 'server'; message: string }

export type SaveStatus = { state: 'idle' } | { state: 'saving' } | ({ state: 'error' } & SaveFailure)

/** Everything a Save needs, captured at the moment it starts. `snapshot` is frozen. */
export interface SaveTicket {
  readonly epoch: number
  readonly ownerId: string
  readonly baseRevision: number
  readonly snapshot: WorkspaceConfig
}

export type ApplyOutcome = { status: 'applied' } | { status: 'noop' } | { status: 'rejected'; error: string }

export interface LoadInput {
  ownerId: string
  workspaceId: string
  revision: number
  config: WorkspaceConfig
}

export interface EditorState {
  /** Bumped by every load/reset. Async save results from an older epoch are ignored. */
  epoch: number
  ownerId: string | null
  workspaceId: string | null
  revision: number | null
  savedConfig: WorkspaceConfig | null
  draftConfig: WorkspaceConfig | null
  mode: Mode
  selection: Selection | null
  /** Transient gesture state; a Save is refused while one is active. */
  interaction: { gesture: GestureKind | null }
  saveStatus: SaveStatus
  /**
   * True while the session has expired but the owner's draft is kept in memory awaiting a
   * re-login. A frozen editor accepts no mutations, saves or cancels.
   */
  frozen: boolean

  load: (input: LoadInput) => void
  reset: () => void
  apply: (command: Command) => ApplyOutcome
  setMode: (mode: Mode) => void
  select: (selection: Selection | null) => void
  beginGesture: (kind: GestureKind) => boolean
  endGesture: () => void
  beginSave: () => SaveTicket | null
  saveSucceeded: (ticket: SaveTicket, result: { revision: number; config: WorkspaceConfig }) => 'applied' | 'ignored'
  saveFailed: (ticket: SaveTicket, failure: SaveFailure) => 'applied' | 'ignored'
  dismissSaveError: () => void
  /** Record a failure that is not tied to a save ticket (e.g. a conflict found after re-login). */
  reportFailure: (failure: SaveFailure) => void
  freeze: () => void
  unfreeze: () => void
  cancel: () => boolean
}

const EMPTY = {
  ownerId: null,
  workspaceId: null,
  revision: null,
  savedConfig: null,
  draftConfig: null,
  mode: 'edit' as Mode,
  selection: null,
  interaction: { gesture: null },
  saveStatus: { state: 'idle' } as SaveStatus,
  frozen: false,
}

export const useEditorStore = create<EditorState>()((set, get) => {
  const owns = (ticket: SaveTicket) => get().epoch === ticket.epoch && get().ownerId === ticket.ownerId

  return {
    epoch: 0,
    ...EMPTY,

    load({ ownerId, workspaceId, revision, config }) {
      // Separate deep copies so saved and draft can never alias each other or the caller's object.
      set({
        ...EMPTY,
        epoch: get().epoch + 1,
        ownerId,
        workspaceId,
        revision,
        savedConfig: deepFreeze(structuredClone(config)),
        draftConfig: deepFreeze(structuredClone(config)),
      })
    },

    reset() {
      set({ ...EMPTY, epoch: get().epoch + 1 })
    },

    apply(command) {
      const { draftConfig } = get()
      if (!draftConfig) return { status: 'rejected', error: 'No workspace is loaded.' }
      if (get().frozen) return { status: 'rejected', error: 'Your session expired. Sign in to continue editing.' }
      const result = command(draftConfig)
      if (!result.ok) return { status: 'rejected', error: result.error }
      if (result.config === draftConfig || deepEqual(result.config, draftConfig)) return { status: 'noop' }

      // The draft must always be a valid, canonical document so it can always be saved.
      const parsed = parseWorkspaceConfig(result.config)
      if (!parsed.ok) return { status: 'rejected', error: parsed.message }
      if (!deepEqual(parsed.config, result.config)) {
        return { status: 'rejected', error: 'The change produced a non-canonical configuration.' }
      }
      set({ draftConfig: deepFreeze(result.config) })
      return { status: 'applied' }
    },

    setMode: (mode) => set({ mode }),
    select: (selection) => set({ selection }),

    beginGesture(kind) {
      if (get().interaction.gesture) return false
      set({ interaction: { gesture: kind } })
      return true
    },
    endGesture: () => set({ interaction: { gesture: null } }),

    beginSave() {
      const { ownerId, revision, draftConfig, savedConfig, saveStatus, interaction, epoch, frozen } = get()
      if (!ownerId || revision === null || !draftConfig || !savedConfig || frozen) return null
      if (saveStatus.state === 'saving' || interaction.gesture) return null // no duplicate or mid-drag saves
      if (selectIsDirty(get()) === false) return null
      // The draft is frozen, so this reference is an immutable snapshot of what is being saved.
      const ticket: SaveTicket = { epoch, ownerId, baseRevision: revision, snapshot: draftConfig }
      set({ saveStatus: { state: 'saving' } })
      return ticket
    },

    saveSucceeded(ticket, result) {
      if (!owns(ticket)) return 'ignored'
      const saved = deepFreeze(structuredClone(result.config))
      const { draftConfig } = get()
      // Replace the draft only if nothing was edited since the snapshot; otherwise keep the newer edits.
      const unchanged = draftConfig === ticket.snapshot || deepEqual(draftConfig, ticket.snapshot)
      set({
        savedConfig: saved,
        revision: result.revision,
        draftConfig: unchanged ? saved : draftConfig,
        saveStatus: { state: 'idle' },
      })
      return 'applied'
    },

    saveFailed(ticket, failure) {
      if (!owns(ticket)) return 'ignored'
      // Saved baseline, draft and revision are kept untouched so the user can retry or keep editing.
      set({ saveStatus: { state: 'error', ...failure } })
      return 'applied'
    },

    dismissSaveError() {
      if (get().saveStatus.state === 'error') set({ saveStatus: { state: 'idle' } })
    },

    reportFailure: (failure) => set({ saveStatus: { state: 'error', ...failure } }),

    freeze: () => set({ frozen: true, interaction: { gesture: null } }),

    unfreeze() {
      const { saveStatus } = get()
      // An interrupted save (`unauthenticated`) is over; any other error stays visible.
      const interrupted = saveStatus.state === 'saving' || (saveStatus.state === 'error' && saveStatus.kind === 'unauthenticated')
      set({ frozen: false, ...(interrupted && { saveStatus: { state: 'idle' } as SaveStatus }) })
    },

    cancel() {
      const { savedConfig, saveStatus, frozen } = get()
      if (!savedConfig || saveStatus.state === 'saving' || frozen) return false
      set({
        draftConfig: savedConfig, // frozen, so sharing the reference is safe
        selection: null,
        interaction: { gesture: null },
        saveStatus: { state: 'idle' },
      })
      return true
    },
  }
})

let lastDirty: { saved: unknown; draft: unknown; result: boolean } | null = null

/** Derived, never stored: a true deep comparison of the draft against the saved baseline. */
export function selectIsDirty(state: Pick<EditorState, 'savedConfig' | 'draftConfig'>): boolean {
  const { savedConfig: saved, draftConfig: draft } = state
  if (!saved || !draft || saved === draft) return false
  if (lastDirty && lastDirty.saved === saved && lastDirty.draft === draft) return lastDirty.result
  const result = !deepEqual(saved, draft)
  lastDirty = { saved, draft, result }
  return result
}
