import { useEffect } from 'react'
import { useEditorStore } from './editorStore'

const DISCRETE_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image'])

/** A control whose edits arrive as a stream of small changes (typing, sliding, picking a colour). */
export function isContinuousControl(element: Element | null): boolean {
  if (!element) return false
  // Controls inside a dialog (choosing where to add, searching) are not a stream of draft edits.
  if (element.closest('[data-dialog-root]')) return false
  if (element instanceof HTMLInputElement) return !DISCRETE_INPUTS.has(element.type)
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true
  return element instanceof HTMLElement && (element.isContentEditable || element.classList.contains('react-colorful__interactive'))
}

/** Where the browser's own text undo should win over ours. */
export function isTextEntry(element: EventTarget | null): boolean {
  return element instanceof HTMLElement && (element.isContentEditable || element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && !DISCRETE_INPUTS.has(element.type)))
}

/**
 * Turns "one focus or drag session" into one history step: while focus is in a text, number, colour
 * or similar control, or a colour picker is being dragged, every change made shares a single step.
 * Moving focus away (or releasing the pointer) ends the step.
 */
export function useEditSessions(): void {
  useEffect(() => {
    const { beginEditSession, endEditSession } = useEditorStore.getState()
    let dragging = false
    const onFocusIn = (event: FocusEvent) => {
      if (isContinuousControl(event.target as Element)) beginEditSession()
    }
    const onFocusOut = () => {
      if (!dragging) endEditSession()
    }
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.('.react-colorful')) {
        dragging = true
        beginEditSession()
      }
    }
    const onPointerEnd = () => {
      if (!dragging) return
      dragging = false
      if (!isContinuousControl(document.activeElement)) endEditSession()
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
      useEditorStore.getState().endEditSession()
    }
  }, [])
}

/** Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, except inside text fields (which undo their own text). */
export function useHistoryShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented || isTextEntry(event.target)) return
      const key = event.key.toLowerCase()
      const { undo, redo } = useEditorStore.getState()
      if (key === 'z' && !event.shiftKey) {
        if (undo()) event.preventDefault()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        if (redo()) event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
