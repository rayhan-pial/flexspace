import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

export type RailView = 'My workspace' | 'Outline' | 'Components' | 'Templates' | 'Appearance'

/** The single inspector column beside the canvas (Edit on desktop). */
export const inspectorPanel = () => screen.getByRole('complementary', { name: 'Inspector' })
export const inspector = () => within(inspectorPanel())

/** Click a destination of the application rail and return queries scoped to the inspector. */
export async function goTo(user: UserEvent, view: RailView) {
  const rail = within(screen.getByRole('navigation', { name: 'Editor navigation' }))
  await user.click(rail.getByRole('button', { name: new RegExp(`^${view}$`) }))
  return inspector()
}
