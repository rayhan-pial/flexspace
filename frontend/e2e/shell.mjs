// Shared helpers for the editor shell: one application rail and one inspector column.

/** The inspector column beside the canvas. */
export const inspector = (page) => page.getByRole('complementary', { name: 'Inspector' })

/** Open a destination of the application rail: 'My workspace', 'Outline', 'Components', 'Templates' or 'Appearance'. */
export async function goTo(page, view) {
  await page.getByRole('navigation', { name: 'Editor navigation' }).getByRole('button', { name: view, exact: true }).click()
  return inspector(page)
}
