import { ApiError } from '../../api/client'
import { getWorkspace, putWorkspace } from '../../api/workspace'
import type { WorkspaceEnvelope } from '../../api/workspace'
import { deepEqual } from '../../domain/workspace/immutable'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { useSessionStore } from '../auth/sessionStore'
import { useEditorStore } from './editorStore'
import type { SaveFailure, SaveTicket } from './editorStore'

/*
 * Connects the editor state machine to GET/PUT /api/workspace. Every outcome goes through the
 * ticket captured by `beginSave`, so a response for a previous owner or an older load is ignored.
 */

const editor = () => useEditorStore.getState()
const session = () => useSessionStore.getState()

const MESSAGES = {
  network: "Couldn't reach the server, so your changes were not saved. Check your connection and try again.",
  server: 'The server had a problem saving your changes. Please try again.',
  unconfirmed: "Couldn't confirm whether your changes were saved. Try saving again.",
  unreadable: 'The server returned a workspace this version cannot read.',
}

function finishSuccess(ticket: SaveTicket, envelope: WorkspaceEnvelope) {
  const parsed = parseWorkspaceConfig(envelope.config)
  if (!parsed.ok) {
    editor().saveFailed(ticket, { kind: 'server', message: MESSAGES.unreadable })
    return
  }
  editor().saveSucceeded(ticket, { revision: envelope.revision, config: parsed.config })
}

/** A 401 while saving: record it, then freeze the draft behind re-authentication. */
function sessionExpired(ticket: SaveTicket) {
  const outcome = editor().saveFailed(ticket, { kind: 'unauthenticated', message: 'Your session expired.' })
  if (outcome === 'applied') session().handleUnauthorized() // ignored if the owner/epoch already moved on
}

/**
 * The PUT may have committed even though its response was lost (network drop, gateway error).
 * Fetch the saved document and compare it with the snapshot before reporting anything.
 */
async function reconcile(ticket: SaveTicket, original: SaveFailure) {
  let envelope: WorkspaceEnvelope
  try {
    envelope = await getWorkspace()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) sessionExpired(ticket)
    else editor().saveFailed(ticket, { kind: 'network', message: MESSAGES.unconfirmed })
    return
  }
  const parsed = parseWorkspaceConfig(envelope.config)
  if (envelope.revision > ticket.baseRevision) {
    if (parsed.ok && deepEqual(parsed.config, ticket.snapshot)) {
      // Our save did commit: treat it as a success.
      editor().saveSucceeded(ticket, { revision: envelope.revision, config: parsed.config })
    } else {
      editor().saveFailed(ticket, {
        kind: 'conflict',
        message: 'This workspace was changed in another tab or session.',
        currentRevision: envelope.revision,
      })
    }
    return
  }
  editor().saveFailed(ticket, original) // nothing was committed: a plain, retryable failure
}

async function handleSaveError(ticket: SaveTicket, error: unknown) {
  if (!(error instanceof ApiError)) {
    editor().saveFailed(ticket, { kind: 'server', message: MESSAGES.server })
    return
  }
  if (error.status === 401) return sessionExpired(ticket)
  if (error.status === 409 && error.code === 'revision_conflict') {
    const current = Number(error.details.currentRevision)
    editor().saveFailed(ticket, {
      kind: 'conflict',
      message: 'This workspace was changed in another tab or session.',
      currentRevision: Number.isFinite(current) ? current : ticket.baseRevision,
    })
    return
  }
  if (error.status === 413) {
    editor().saveFailed(ticket, { kind: 'too_large', message: 'This workspace is too large to save. Remove some content and try again.' })
    return
  }
  if (error.status === 422) {
    editor().saveFailed(ticket, { kind: 'validation', message: "Your changes couldn't be saved because they are not valid." })
    return
  }
  if (error.status === 0 || error.status >= 500) {
    // Ambiguous outcome: the server may have committed before the connection failed.
    await reconcile(ticket, error.status === 0
      ? { kind: 'network', message: MESSAGES.network }
      : { kind: 'server', message: MESSAGES.server })
    return
  }
  editor().saveFailed(ticket, { kind: 'server', message: error.message })
}

/** Save the current draft. Safe to call repeatedly: only one save runs at a time. */
export async function saveDraft(): Promise<void> {
  const ticket = editor().beginSave()
  if (!ticket) return
  try {
    const envelope = await putWorkspace(ticket.baseRevision, ticket.snapshot, session().csrfToken)
    finishSuccess(ticket, envelope)
  } catch (error) {
    await handleSaveError(ticket, error)
  }
}

export type ReloadResult = { ok: true } | { ok: false; message: string }

/**
 * Replace the draft and baseline with the server's latest. This discards unsaved edits, so the UI
 * must confirm first; it is refused while a save is in flight.
 */
export async function reloadLatest(): Promise<ReloadResult> {
  const { ownerId, epoch, saveStatus, frozen } = editor()
  if (!ownerId || frozen || saveStatus.state === 'saving') return { ok: false, message: 'Wait for the current save to finish.' }
  const stillSame = () => editor().ownerId === ownerId && editor().epoch === epoch
  try {
    const envelope = await getWorkspace()
    if (!stillSame()) return { ok: false, message: 'The workspace changed while reloading.' }
    const parsed = parseWorkspaceConfig(envelope.config)
    if (!parsed.ok) return { ok: false, message: MESSAGES.unreadable }
    editor().load({ ownerId, workspaceId: envelope.id, revision: envelope.revision, config: parsed.config })
    return { ok: true }
  } catch (error) {
    if (!stillSame()) return { ok: false, message: 'The workspace changed while reloading.' }
    if (error instanceof ApiError && error.status === 401) {
      session().handleUnauthorized()
      return { ok: false, message: 'Your session expired.' }
    }
    return { ok: false, message: error instanceof ApiError && error.status === 0 ? MESSAGES.network : "Couldn't reload the workspace. Try again." }
  }
}
