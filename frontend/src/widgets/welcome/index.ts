import { DEFAULT_WIDGET_PROPS } from '../../domain/workspace/defaults'
import type { WelcomeProps } from '../../domain/workspace/types'
import type { WidgetDefinition } from '../types'
import WelcomeWidget, { GREETING_MAX, SUBTITLE_MAX } from './WelcomeWidget'

export const welcomeWidget: WidgetDefinition<WelcomeProps> = {
  type: 'welcome',
  label: 'Welcome',
  defaultProps: DEFAULT_WIDGET_PROPS.welcome,
  fields: [
    { key: 'greeting', label: 'Greeting', kind: 'text', maxLength: GREETING_MAX },
    { key: 'subtitle', label: 'Subtitle', kind: 'text', maxLength: SUBTITLE_MAX },
  ],
  Component: WelcomeWidget,
}
