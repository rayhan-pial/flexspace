import { create } from 'zustand'
import type { Command } from '../../domain/workspace/commands'
import { deepEqual, deepFreeze } from '../../domain/workspace/immutable'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import type { WorkspaceConfig } from '../../domain/workspace/types'
import { resolveSelection } from './selection'
import type { Selection } from './selection'

export type { Selection }

/*
 * Editor domain state (docs/architecture.md section 6). The saved baseline and the draft are the
 * only copies of the workspace; components read them through selectors and change the draft only
 * through `apply(command)`. Nothing here is persisted to browser storage.
 */

export type Mode = 'edit' | 'preview'
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

/** Undo/Redo keeps at most this many earlier drafts (docs/architecture.md section 6). */
export const HISTORY_LIMIT = 30

/**
 * Optional bounded history of drafts (never persisted, never sent anywhere). `past` and `future` hold
 * frozen drafts, which share structure with the live one, so keeping 30 is cheap. A *session* groups
 * the many small commands of one text edit or one colour drag into a single step.
 */
export interface History {
  readonly past: readonly WorkspaceConfig[]
  readonly future: readonly WorkspaceConfig[]
  /** Set while a text or colour edit is under way; its commands share one history step. */
  readonly session: number | null
  /** Whether the open session has already recorded its step. */
  readonly recorded: boolean
  /** What the last Undo or Redo did, in words, for the status line and screen readers. */
  readonly note: string
}

const NO_HISTORY: History = { past: [], future: [], session: null, recorded: false, note: '' }

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
  history: History
  /**
   * True while the session has expired but the owner's draft is kept in memory awaiting a
   * re-login. A frozen editor accepts no mutations, saves or cancels.
   */
  frozen: boolean
  /**
   * True while a confirmed "Reload latest" request is in flight. The draft is locked (no edits, undo,
   * save or cancel) so nothing typed meanwhile can be replaced by the response.
   */
  reloading: boolean

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
  /** Start a reload: locks the draft. Null when one cannot start (no draft, frozen, saving, already reloading). */
  beginReload: () => { epoch: number; ownerId: string } | null
  /** Unlock after a failed or abandoned reload. The draft is untouched. Ignored if the owner/epoch moved on. */
  endReload: (ticket: { epoch: number; ownerId: string }) => void
  cancel: () => boolean
  /** Group the commands that follow into one history step until `endEditSession`. */
  beginEditSession: () => void
  endEditSession: () => void
  /** Step back or forward through earlier drafts. Draft only: nothing is sent and the baseline is untouched. */
  undo: () => boolean
  redo: () => boolean
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
  history: NO_HISTORY,
  frozen: false,
  reloading: false,
}

export const useEditorStore = create<EditorState>()((set, get) => {
  const owns = (ticket: SaveTicket) => get().epoch === ticket.epoch && get().ownerId === ticket.ownerId
  let sessions = 0
  /** Undo and Redo need an editable, idle draft: not frozen, and not in the middle of a drag. */
  const canStep = () => {
    const { draftConfig, frozen, interaction, reloading } = get()
    return draftConfig !== null && !frozen && !reloading && !interaction.gesture
  }

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
      if (get().reloading) return { status: 'rejected', error: 'Reloading the latest workspace. Editing resumes when it finishes.' }
      const result = command(draftConfig)
      if (!result.ok) return { status: 'rejected', error: result.error }
      if (result.config === draftConfig || deepEqual(result.config, draftConfig)) return { status: 'noop' }

      // The draft must always be a valid, canonical document so it can always be saved.
      const parsed = parseWorkspaceConfig(result.config)
      if (!parsed.ok) return { status: 'rejected', error: parsed.message }
      if (!deepEqual(parsed.config, result.config)) {
        return { status: 'rejected', error: 'The change produced a non-canonical configuration.' }
      }
      const next = deepFreeze(result.config)
      // A command may remove what is selected; never keep a selection that points at nothing.
      const { selection, history } = get()
      // One step per command, except that a text edit or colour drag in progress records only its first.
      const record = !(history.session !== null && history.recorded)
      set({
        draftConfig: next,
        selection: resolveSelection(next, selection) ? selection : null,
        history: {
          past: record ? [...history.past, draftConfig].slice(-HISTORY_LIMIT) : history.past,
          future: [], // a new change ends the redo trail
          session: history.session,
          recorded: history.session !== null,
          note: '',
        },
      })
      return { status: 'applied' }
    },

    setMode: (mode) => set({ mode }),
    select(selection) {
      // Selecting something that does not exist in the draft is the same as selecting nothing.
      set({ selection: resolveSelection(get().draftConfig, selection) ? selection : null })
    },

    beginGesture(kind) {
      if (get().interaction.gesture || get().reloading) return false
      set({ interaction: { gesture: kind } })
      return true
    },
    endGesture: () => set({ interaction: { gesture: null } }),

    beginSave() {
      const { ownerId, revision, draftConfig, savedConfig, saveStatus, interaction, epoch, frozen, reloading } = get()
      if (!ownerId || revision === null || !draftConfig || !savedConfig || frozen || reloading) return null
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

    beginReload() {
      const { ownerId, epoch, draftConfig, frozen, reloading, saveStatus } = get()
      if (!ownerId || !draftConfig || frozen || reloading || saveStatus.state === 'saving') return null
      set({ reloading: true, interaction: { gesture: null } })
      return { epoch, ownerId }
    },

    endReload(ticket) {
      if (get().epoch === ticket.epoch && get().ownerId === ticket.ownerId && get().reloading) set({ reloading: false })
    },

    cancel() {
      const { savedConfig, saveStatus, frozen, reloading } = get()
      if (!savedConfig || saveStatus.state === 'saving' || frozen || reloading) return false
      set({
        draftConfig: savedConfig, // frozen, so sharing the reference is safe
        selection: null,
        interaction: { gesture: null },
        saveStatus: { state: 'idle' },
        history: NO_HISTORY,
      })
      return true
    },

    beginEditSession() {
      const { history } = get()
      if (history.session !== null) return
      set({ history: { ...history, session: ++sessions, recorded: false } })
    },
    endEditSession() {
      const { history } = get()
      if (history.session !== null) set({ history: { ...history, session: null, recorded: false } })
    },

    undo() {
      const { draftConfig, history, selection } = get()
      if (!canStep() || !draftConfig || history.past.length === 0) return false
      const previous = history.past[history.past.length - 1]
      set({
        draftConfig: previous,
        selection: resolveSelection(previous, selection) ? selection : null,
        history: { past: history.past.slice(0, -1), future: [...history.future, draftConfig], session: null, recorded: false, note: 'Undid the last change.' },
      })
      return true
    },
    redo() {
      const { draftConfig, history, selection } = get()
      if (!canStep() || !draftConfig || history.future.length === 0) return false
      const next = history.future[history.future.length - 1]
      set({
        draftConfig: next,
        selection: resolveSelection(next, selection) ? selection : null,
        history: { past: [...history.past, draftConfig], future: history.future.slice(0, -1), session: null, recorded: false, note: 'Redid the change.' },
      })
      return true
    },
  }
})

export const selectCanUndo = (state: Pick<EditorState, 'history' | 'frozen' | 'interaction' | 'reloading'>): boolean =>
  state.history.past.length > 0 && !state.frozen && !state.reloading && !state.interaction.gesture
export const selectCanRedo = (state: Pick<EditorState, 'history' | 'frozen' | 'interaction' | 'reloading'>): boolean =>
  state.history.future.length > 0 && !state.frozen && !state.reloading && !state.interaction.gesture

type Gate = Pick<EditorState, 'frozen' | 'reloading' | 'interaction' | 'saveStatus' | 'savedConfig' | 'draftConfig' | 'history'>

/** Why a Save cannot run right now, in words, or null. Pure: reads state only. */
export function saveBlocker(state: Gate): string | null {
  if (!state.draftConfig) return 'No workspace is loaded.'
  if (state.frozen) return 'Sign in again to keep editing.'
  if (state.reloading) return 'The latest saved workspace is loading.'
  if (state.saveStatus.state === 'saving') return 'A save is already in progress.'
  if (state.interaction.gesture) return 'Finish the drag or resize first.'
  if (!selectIsDirty(state)) return 'There are no unsaved changes.'
  return null
}

/** Why Cancel (discard changes) cannot run right now, or null. */
export function cancelBlocker(state: Gate): string | null {
  if (!state.draftConfig) return 'No workspace is loaded.'
  if (state.frozen) return 'Sign in again to keep editing.'
  if (state.reloading) return 'The latest saved workspace is loading.'
  if (state.saveStatus.state === 'saving') return 'A save is in progress.'
  if (!selectIsDirty(state)) return 'There are no unsaved changes to discard.'
  return null
}

/** Why Undo or Redo cannot run right now, or null. */
export function historyBlocker(state: Gate, direction: 'undo' | 'redo'): string | null {
  if (state.frozen) return 'Sign in again to keep editing.'
  if (state.reloading) return 'The latest saved workspace is loading.'
  if (state.interaction.gesture) return 'Finish the drag or resize first.'
  const steps = direction === 'undo' ? state.history.past.length : state.history.future.length
  return steps === 0 ? (direction === 'undo' ? 'There is nothing to undo.' : 'There is nothing to redo.') : null
}

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
