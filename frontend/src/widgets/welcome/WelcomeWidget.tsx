import type { WelcomeProps } from '../../domain/workspace/types'
import type { WidgetRenderProps } from '../types'

export const GREETING_MAX = 200
export const SUBTITLE_MAX = 400

/** A greeting and a line of supporting text. Rendered as plain text; edited from the inspector. */
export default function WelcomeWidget({ props, mode }: WidgetRenderProps<WelcomeProps>) {
  const empty = props.greeting === '' && props.subtitle === ''
  return (
    // The accent is a left border, so it adds no height: Welcome must stay legible at its smallest size.
    <div
      data-welcome-accent={empty ? undefined : 'true'}
      className={`flex h-full min-h-0 flex-col justify-center overflow-hidden ${empty ? '' : 'border-l-4 border-[var(--fs-primary,#6366f1)] pl-3'}`}
    >
      {props.greeting !== '' && <p className="break-words text-2xl font-semibold tracking-tight">{props.greeting}</p>}
      {props.subtitle !== '' && <p className="mt-1 break-words opacity-80">{props.subtitle}</p>}
      {empty && (
        <p className="text-sm opacity-60">
          {mode === 'edit' ? 'Select this widget and add a greeting in Properties.' : 'Nothing to show yet.'}
        </p>
      )}
    </div>
  )
}
