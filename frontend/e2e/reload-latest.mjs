// Real-browser, real-backend regression for UI-019: confirming "Reload latest" pauses editing until the
// GET settles, so a title typed "after confirming" can never be replaced by the old remote copy while the
// status claims "All changes saved". Also covers a failed reload and an account switch while it is pending.
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } })
const page = await context.newPage()
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const title = (p) => p.getByLabel('Workspace title')
const status = (p) => p.getByRole('status', { name: 'Save status' })
const email = `e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`

try {
  log('register and open a second tab on the same session')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await title(page).waitFor()
  const other = await context.newPage()
  await other.goto(baseUrl)
  await title(other).waitFor()

  async function makeConflict(label) {
    await title(other).fill(`Other tab ${label}`)
    await other.getByRole('button', { name: 'Save', exact: true }).click()
    await status(other).filter({ hasText: 'All changes saved' }).waitFor()
    await title(page).fill(`Stale tab ${label}`)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: /changed in another tab/i }).waitFor()
  }

  log('conflict, confirm Reload latest with the GET held: editing is visibly paused and cannot overwrite')
  await makeConflict('one')
  let release
  const held = new Promise((resolve) => { release = resolve })
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await held
      await route.continue()
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Reload latest' }).click()
  await page.getByRole('button', { name: 'Discard and reload' }).click()
  await status(page).filter({ hasText: 'editing is paused' }).waitFor()
  assert.ok(await title(page).isDisabled(), 'title input is unavailable while reloading')
  assert.ok(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled())
  assert.equal(await page.locator('#workspace-canvas').evaluate((el) => !!el.closest('[inert]')), true, 'canvas is inert while reloading')
  await page.keyboard.type('New edit AFTER confirming reload') // typed into nothing: focus cannot be in a field
  release()
  await status(page).filter({ hasText: 'All changes saved' }).waitFor()
  assert.equal(await title(page).inputValue(), 'Other tab one', 'the latest remote copy is shown, honestly, after the lock')
  assert.ok(await title(page).isEnabled())
  assert.ok(!(await page.locator('body').innerText()).includes('New edit AFTER confirming reload'))
  await page.unroute('**/api/workspace')

  log('a failed reload keeps the draft and unlocks editing')
  await makeConflict('two')
  await page.route('**/api/workspace', (route) => (route.request().method() === 'GET' ? route.abort('failed') : route.continue()))
  await page.getByRole('button', { name: 'Reload latest' }).click()
  await page.getByRole('button', { name: 'Discard and reload' }).click()
  await page.getByRole('alert').filter({ hasText: /Couldn't reach the server/ }).waitFor()
  assert.ok(await title(page).isEnabled(), 'editing is available again after the failure')
  assert.equal(await title(page).inputValue(), 'Stale tab two', 'the unsaved draft is still recoverable')
  await title(page).fill('Stale tab two plus more')
  assert.match(await status(page).innerText(), /Unsaved changes/)
  await page.unroute('**/api/workspace')

  log('logging out while a reload is pending: the late response never reaches the next account')
  let release2
  const held2 = new Promise((resolve) => { release2 = resolve })
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await held2
      await route.continue()
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Reload latest' }).click()
  await page.getByRole('button', { name: 'Discard and reload' }).click()
  await status(page).filter({ hasText: 'editing is paused' }).waitFor()
  await page.getByRole('button', { name: 'Log out' }).click()
  const dialog = page.getByRole('alertdialog')
  if (await dialog.count()) await dialog.getByRole('button').last().click()
  await page.getByRole('button', { name: 'Create an account' }).waitFor()
  release2()
  await page.waitForTimeout(500)
  assert.equal(await page.getByLabel('Workspace title').count(), 0, 'no workspace is shown after the late response')
  await page.unroute('**/api/workspace')

  console.log('OK: Reload latest pauses editing, failure keeps the draft, and a late result after logout is ignored')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
