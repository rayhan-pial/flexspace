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
}

/** The editor's one button. Defaults to type="button" so it never submits a form by accident. */
export default function Button({ variant = 'secondary', className = '', type = 'button', ...rest }: Props) {
  return <button type={type} className={`${BASE} ${VARIANTS[variant]} ${className}`.trim()} {...rest} />
}
