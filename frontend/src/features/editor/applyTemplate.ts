import { replaceWorkspace } from '../../domain/workspace/commands'
import { instantiateTemplate } from '../../domain/workspace/instantiate'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { useEditorStore } from './editorStore'
import type { EditorState } from './editorStore'

export type ApplyTemplateResult = { ok: true } | { ok: false; message: string }

/** Why the workspace cannot be replaced right now, or `null` when it can. */
export function replacementBlocker(state: Pick<EditorState, 'draftConfig' | 'frozen' | 'saveStatus' | 'interaction'> & { reloading?: boolean }): string | null {
  if (!state.draftConfig) return 'No workspace is loaded.'
  if (state.frozen) return 'Your session expired. Sign in again to continue.'
  if (state.reloading) return 'Wait for the latest saved workspace to load first.'
  if (state.saveStatus.state === 'saving') return 'Wait for the save to finish before replacing the workspace.'
  if (state.interaction.gesture) return 'Finish the drag in progress first.'
  return null
}

/**
 * Replace the draft with a template's content, as one change. The template is untrusted JSON, so it
 * is parsed and validated first; every entity then gets a fresh id with all references remapped.
 * Only the draft changes: the saved baseline and revision stay exactly as they were, so nothing is
 * written until the user saves, and Cancel returns to the previous saved version.
 */
export function applyTemplateConfig(rawConfig: unknown): ApplyTemplateResult {
  const blocker = replacementBlocker(useEditorStore.getState())
  if (blocker) return { ok: false, message: blocker }

  const parsed = parseWorkspaceConfig(rawConfig)
  if (!parsed.ok) {
    return {
      ok: false,
      message:
        parsed.code === 'unsupported_schema_version'
          ? 'This template was made with a newer version of FlexSpace and cannot be applied here.'
          : 'This template could not be read, so nothing was changed.',
    }
  }

  const outcome = useEditorStore.getState().apply(replaceWorkspace(instantiateTemplate(parsed.config)))
  return outcome.status === 'rejected' ? { ok: false, message: outcome.error } : { ok: true }
}
