import { useEffect } from 'react'
import { selectIsDirty, useEditorStore } from './editorStore'

/** Ask the browser to confirm before a reload/close/navigation discards unsaved changes. */
export function useUnsavedChangesGuard(): void {
  const dirty = useEditorStore(selectIsDirty)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = '' // required by some browsers to show the prompt
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}
