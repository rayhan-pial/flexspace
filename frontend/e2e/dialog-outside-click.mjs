// Real-browser check: every popup closes when the dimmed area around it is clicked (not only with Esc), and focus goes
// back to what opened it. A press that starts inside the popup and ends outside, and any click inside it, do not close
// it. In the Templates gallery an open confirmation step is cancelled first (the gallery stays); a destructive
// confirmation is cancelled, never confirmed, by an outside click. Not part of `npm test`. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { inspector, library, templates } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
const toolbar = page.locator('[data-toolbar]')
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
/** Click the dimmed area: a point inside the full-screen backdrop but outside the dialog panel. */
const clickOutside = async (dialog) => {
  const box = await dialog.boundingBox()
  await page.mouse.click(Math.max(box.x - 30, 5), Math.max(box.y - 30, 5))
}

try {
  log('register')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()

  log('Add a component: a click outside closes it, nothing changes, focus returns to the button that opened it')
  await toolbar.getByRole('button', { name: 'Add component', exact: true }).click()
  await library(page).waitFor()
  await clickOutside(library(page))
  await library(page).waitFor({ state: 'hidden' })
  assert.equal(await status(), 'All changes saved')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Add component')

  log('clicks inside it do not close it, nor does a text selection that ends outside')
  await toolbar.getByRole('button', { name: 'Add component', exact: true }).click()
  await library(page).waitFor()
  await library(page).getByRole('heading', { name: 'Add a component' }).click()
  await library(page).getByLabel('Search components').click()
  const field = await library(page).getByLabel('Search components').boundingBox()
  const panel = await library(page).boundingBox()
  await page.mouse.move(field.x + 20, field.y + field.height / 2)
  await page.mouse.down()
  await page.mouse.move(Math.max(panel.x - 40, 5), field.y + field.height / 2, { steps: 8 })
  await page.mouse.up()
  assert.equal(await library(page).isVisible(), true, 'releasing outside after pressing inside keeps it open')
  await page.keyboard.press('Escape')
  await library(page).waitFor({ state: 'hidden' })

  log('Templates: a click outside closes the gallery')
  await toolbar.getByRole('button', { name: 'Templates', exact: true }).click()
  await templates(page).waitFor()
  await clickOutside(templates(page))
  await templates(page).waitFor({ state: 'hidden' })

  log('Templates with a confirmation open: an outside click cancels only the confirmation, a second one closes the gallery')
  await page.getByLabel('Workspace title').fill('Unsaved edit so applying asks first')
  await toolbar.getByRole('button', { name: 'Templates', exact: true }).click()
  await templates(page).getByRole('radio', { name: /Creative/ }).check()
  await templates(page).getByRole('button', { name: 'Apply Creative' }).click()
  const confirmation = templates(page).getByRole('region', { name: 'Replace your unsaved changes?' })
  await confirmation.waitFor()
  await clickOutside(templates(page))
  await confirmation.waitFor({ state: 'hidden' })
  assert.equal(await templates(page).isVisible(), true, 'the gallery is still open')
  assert.equal(await page.getByLabel('Workspace title').inputValue(), 'Unsaved edit so applying asks first', 'nothing was replaced')
  await clickOutside(templates(page))
  await templates(page).waitFor({ state: 'hidden' })
  assert.equal(await page.getByLabel('Workspace title').inputValue(), 'Unsaved edit so applying asks first')

  log('a destructive confirmation (Remove widget) is cancelled by an outside click, never confirmed')
  const widgets = await page.locator('[data-widget-id]').count()
  await page.getByRole('article', { name: 'Tasks' }).getByRole('button', { name: 'Remove Tasks' }).click()
  const alert = page.getByRole('alertdialog', { name: 'Remove this widget?' })
  await alert.waitFor()
  await clickOutside(alert)
  await alert.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('[data-widget-id]').count(), widgets, 'the widget was not removed')

  log('Log out with unsaved changes: an outside click keeps you signed in with your changes')
  await page.getByRole('button', { name: 'Log out' }).click()
  const logout = page.getByRole('alertdialog', { name: 'Log out and discard changes?' })
  await logout.waitFor()
  await clickOutside(logout)
  await logout.waitFor({ state: 'hidden' })
  assert.equal(await page.getByLabel('Workspace title').inputValue(), 'Unsaved edit so applying asks first')

  console.log('OK: popups close from a click outside; confirmations are cancelled, never confirmed')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
