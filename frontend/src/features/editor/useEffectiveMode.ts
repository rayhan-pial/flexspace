import { useMediaQuery } from '../../shared/hooks/useMediaQuery'
import { useEditorStore } from './editorStore'
import type { Mode } from './editorStore'

/** Layout and property editing need a desktop-width viewport (docs/PROJECT_BRIEF.md). */
export const DESKTOP_QUERY = '(min-width: 1024px)'

export const useIsDesktop = (): boolean => useMediaQuery(DESKTOP_QUERY, true)

/**
 * The mode the UI actually presents. The user's chosen mode lives in the editor store; below
 * desktop width it is forced to Preview without being changed, so widening the window returns
 * to whatever they had chosen.
 */
export function useEffectiveMode(): Mode {
  const chosen = useEditorStore((s) => s.mode)
  return useIsDesktop() ? chosen : 'preview'
}
