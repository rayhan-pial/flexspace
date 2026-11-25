import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

export type RailView = 'My workspace' | 'Outline' | 'Components' | 'Templates' | 'Appearance'

/** The Templates gallery dialog (the Templates destination opens it instead of an inspector view). */
export const templatesDialog = () => within(screen.getByRole('dialog', { name: 'Templates' }))

/** The single inspector column beside the canvas (Edit on desktop). */
export const inspectorPanel = () => screen.getByRole('complementary', { name: 'Inspector' })
export const inspector = () => within(inspectorPanel())

/** The Add component dialog (the Components destination opens it instead of an inspector view). */
export const libraryDialog = () => within(screen.getByRole('dialog', { name: 'Add a component' }))

/**
 * Click a destination of the application rail. Returns queries scoped to the inspector, or to the Add
 * component dialog for 'Components'.
 */
export async function goTo(user: UserEvent, view: RailView) {
  const rail = within(screen.getByRole('navigation', { name: 'Editor navigation' }))
  await user.click(rail.getByRole('button', { name: new RegExp(`^${view}$`) }))
  if (view === 'Components') return libraryDialog()
  return view === 'Templates' ? templatesDialog() : inspector()
}
