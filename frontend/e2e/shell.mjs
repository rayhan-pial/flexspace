// Shared helpers for the editor shell: one application rail and one inspector column.

/** The inspector column beside the canvas. */
export const inspector = (page) => page.getByRole('complementary', { name: 'Inspector' })

/** The Add component dialog that the rail's Components destination opens. */
export const library = (page) => page.getByRole('dialog', { name: 'Add a component' })

/** The Templates gallery dialog that the rail's Templates destination opens. */
export const templates = (page) => page.getByRole('dialog', { name: 'Templates' })

/**
 * Open a destination of the application rail: 'My workspace', 'Outline', 'Templates' or 'Appearance'
 * (shown in the inspector), or 'Components' (opens the Add component dialog). Returns the matching locator.
 */
export async function goTo(page, view) {
  await page.getByRole('navigation', { name: 'Editor navigation' }).getByRole('button', { name: view, exact: true }).click()
  if (view === 'Components') {
    await library(page).waitFor()
    return library(page)
  }
  if (view === 'Templates') {
    await templates(page).waitFor()
    return templates(page)
  }
  return inspector(page)
}
