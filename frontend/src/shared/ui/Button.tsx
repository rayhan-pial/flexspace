import { useId } from 'react'
import type { ComponentProps } from 'react'

type ButtonVariant ='primary' | 'secondary' | 'quiet' | 'destructive'

const BASE =
  'ui-focus inline-flex items-center justify-center gap-2 rounded-ui-control px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:min-h-11'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ui-primary text-white hover:bg-ui-primary-hover',
  secondary: 'border border-ui-control bg-ui-surface text-ui-text hover:bg-ui-subtle',
  quiet: 'text-ui-muted hover:bg-ui-subtle hover:text-ui-text',
  destructive: 'bg-ui-danger text-white hover:bg-ui-danger-hover',
}

interface Props extends ComponentProps<'button'> {
  variant?: ButtonVariant
  /**
   * Why the button cannot be used right now. A non-empty reason makes the button natively disabled and
   * is attached with `aria-describedby`, so it is announced with the button instead of living only in a tooltip.
   */
  reason?: string | null
}

/** The editor's one button. Defaults to type="button" so it never submits a form by accident. */
export default function Button({ variant = 'secondary', className = '', type = 'button', reason, disabled, ...rest }: Props) {
  const reasonId = useId()
  const unavailable = Boolean(reason)
  return (
    <>
      <button
        type={type}
        className={`${BASE} ${VARIANTS[variant]} ${className}`.trim()}
        disabled={disabled || unavailable}
        aria-describedby={unavailable ? reasonId : rest['aria-describedby']}
        {...rest}
        {...(unavailable && { 'aria-describedby': reasonId })}
      />
      {unavailable && <span id={reasonId} className="sr-only">{reason}</span>}
    </>
  )
}
