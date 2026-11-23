import type { WelcomeProps } from '../../domain/workspace/types'
import type { WidgetRenderProps } from '../types'

export const GREETING_MAX = 200
export const SUBTITLE_MAX = 400

/** A greeting and a line of supporting text. Rendered as plain text; edited from the inspector. */
export default function WelcomeWidget({ props, mode }: WidgetRenderProps<WelcomeProps>) {
  const empty = props.greeting === '' && props.subtitle === ''
  return (
    <div className="flex h-full min-h-0 flex-col justify-center overflow-hidden">
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
