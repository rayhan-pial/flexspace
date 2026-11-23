// Real-browser, real-backend check of the Calendar widget and the Notes limit feedback (FS-018).
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const outline = page.getByRole('list', { name: 'Components' })
const settings = page.getByRole('complementary', { name: 'Settings panel' })
const status = () => page.getByRole('status').first().innerText()
const calendar = page.locator('[data-widget-id]:has(table)')
const agenda = async () => (await calendar.getByRole('list').last().getByRole('listitem').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())

try {
  log('register and open the starter workspace (it already has a Calendar)')
  const email = `e2e${Date.now()}@example.com`
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await outline.waitFor()
  // The starter workspace already has a calendar: use it.
  const starterMonth = await calendar.locator('p[aria-live]').innerText()
  const starterAgenda = await agenda()
  assert.ok(starterAgenda.length >= 1, `starter agenda is shown (${starterAgenda.join(' | ')})`)
  assert.equal(await status(), 'All changes saved')

  log('browsing months never dirties the workspace')
  await calendar.getByRole('button', { name: 'Next month' }).click()
  await calendar.getByRole('button', { name: 'Next month' }).click()
  assert.notEqual(await calendar.locator('p[aria-live]').innerText(), starterMonth)
  await calendar.getByRole('button', { name: 'Previous month' }).click()
  assert.equal(await status(), 'All changes saved')
  await page.getByRole('button', { name: 'Preview' }).click()
  await calendar.getByRole('button', { name: 'Next month' }).click()
  assert.equal(await status(), 'All changes saved')
  await page.getByRole('button', { name: 'Edit workspace' }).click()
  // Switching modes remounts the grid, so transient browsing resets to the saved month.
  assert.equal(await calendar.locator('p[aria-live]').innerText(), starterMonth)
  await calendar.getByRole('button', { name: 'Next month' }).click()
  await calendar.getByRole('button', { name: /Back to/ }).click()
  assert.equal(await calendar.locator('p[aria-live]').innerText(), starterMonth)

  log('edit the saved display month and an event with the real date input')
  await outline.getByRole('button', { name: 'Calendar', exact: true }).click()
  await settings.getByLabel('Display month').selectOption('9')
  await settings.getByLabel('Display year').fill('2027')
  await calendar.getByText('September 2027').waitFor()
  await settings.getByRole('button', { name: 'Add event' }).click()
  const count = (await agenda()).length
  const dateInput = settings.getByLabel(`Date for event ${count}`)
  await dateInput.fill('2027-09-14')
  assert.equal(await dateInput.inputValue(), '2027-09-14')
  await settings.getByLabel(`Title for event ${count}`).fill('Quarterly retro')
  await settings.getByLabel(`Title for event ${count}`).press('Enter')
  await calendar.getByText('Quarterly retro').waitFor()
  const cell = calendar.getByRole('cell').filter({ hasText: /^14, 1 event/ })
  assert.equal(await cell.count(), 1, 'the 14th is marked in the month grid')
  assert.equal(await status(), 'Unsaved changes')
  const savedAgenda = await agenda()
  assert.equal(savedAgenda.at(-1), 'Sep 14, 2027 Quarterly retro', 'new events join the end of the stored agenda')

  log('Save, log out, log in: month, events and order are the same')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('All changes saved').waitFor()
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('heading', { name: 'Sign in to your workspace' }).waitFor()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await outline.waitFor()
  await calendar.getByText('September 2027').waitFor()
  assert.deepEqual(await agenda(), savedAgenda)
  assert.equal(await status(), 'All changes saved')

  log('Notes warns when it approaches and reaches the 10,000 character limit')
  const notes = page.locator('[data-widget-id]:has(textarea)').first()
  await notes.locator('textarea').fill('x'.repeat(9500))
  await notes.getByText('9,500 / 10,000').waitFor()
  assert.match(await notes.getByText('9,500 / 10,000').getAttribute('class'), /text-amber-700/)
  await notes.locator('textarea').fill('x'.repeat(10_000))
  await notes.getByText(/Limit reached/).waitFor()
  await notes.locator('textarea').press('End')
  await page.keyboard.type('more')
  assert.equal((await notes.locator('textarea').inputValue()).length, 10_000, 'typing past the limit is refused')

  console.log('\nOK: real browser Calendar and Notes checks pass')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
