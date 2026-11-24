import { useEffect, useId, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const SIZES = { sm: 'max-w-sm', md: 'max-w-xl', lg: 'max-w-4xl' } as const

// Open dialogs, topmost last. Only the topmost reacts to the keyboard.
const stack: symbol[] = []

interface Props {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof SIZES
  /** `alertdialog` for confirmations that interrupt the user. */
  role?: 'dialog' | 'alertdialog'
  /** Element that receives focus on open; defaults to the first focusable control. */
  initialFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Modal dialog shell. It renders in a portal, makes the rest of the page inert (so focus and clicks
 * cannot reach it), locks page scrolling, moves focus in, keeps Tab inside, closes on Escape, and
 * returns focus to the element that opened it. Content and actions are the caller's.
 */
export default function Dialog({ title, description, onClose, children, footer, size = 'md', role = 'dialog', initialFocusRef }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const token = Symbol('dialog')
    stack.push(token)
    const opener = document.activeElement as HTMLElement | null

    // Everything else in <body> becomes inert; remember what was already inert to restore exactly that.
    const portalRoot = panel.closest('[data-dialog-root]')
    const inerted = Array.from(document.body.children).filter((el) => el !== portalRoot && !el.hasAttribute('inert') && el.tagName !== 'SCRIPT')
    inerted.forEach((el) => el.setAttribute('inert', ''))
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[hidden]'))
    ;(initialFocusRef?.current ?? focusables()[0] ?? panel).focus()

    function onKeyDown(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== token) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      } else if (event.key === 'Tab') {
        const items = focusables()
        if (items.length === 0) {
          event.preventDefault()
          panel!.focus()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (!panel!.contains(active)) {
          event.preventDefault()
          first.focus()
        } else if (event.shiftKey && (active === first || active === panel)) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      stack.splice(stack.indexOf(token), 1)
      inerted.forEach((el) => el.removeAttribute('inert'))
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus()
    }
  }, [initialFocusRef])

  return createPortal(
    <div data-dialog-root className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 sm:p-6">
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`flex max-h-full w-full ${SIZES[size]} flex-col rounded-ui-dialog bg-ui-surface text-ui-text shadow-ui-dialog ring-1 ring-ui-border outline-none`}
      >
        <div className="px-6 pt-6">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          {description && <p id={descriptionId} className="mt-2 text-sm text-ui-muted">{description}</p>}
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div> : <div className="h-4" />}
        {footer && <div className="flex justify-end gap-3 border-t border-ui-border px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
