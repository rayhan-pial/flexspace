// Real-browser, real-backend check of the Welcome and Tasks widgets (FS-016). Not part of `npm test`.
// Same prerequisites as grid-gesture.mjs (API + dev server running, scratch database). Run: npm run test:browser
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
const tasks = page.locator('[data-widget-id="w-tasks"]')
const welcome = page.locator('[data-widget-id="w-welcome"]')
const status = () => page.getByRole('status').first().innerText()
const taskTexts = async () => tasks.locator('input[type="text"][aria-label^="Task text"]').evaluateAll((els) => els.map((e) => e.value))

try {
  log('register and open the starter workspace')
  const email = `e2e${Date.now()}@example.com`
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('list', { name: 'Components' }).waitFor()
  const starter = await taskTexts()
  assert.ok(starter.length >= 2, `starter tasks render (${starter.join(' | ')})`)
  assert.equal(await status(), 'All changes saved')

  log('typing in a task field does not drag the widget')
  const before = await tasks.boundingBox()
  await tasks.locator('input[type="text"][aria-label^="Task text"]').first().click()
  await page.mouse.down()
  await page.mouse.move(before.x + 200, before.y + 200, { steps: 8 })
  await page.mouse.up()
  assert.deepEqual(await tasks.boundingBox(), before)
  assert.equal(await status(), 'All changes saved')

  log('edit the greeting from Properties')
  await page.getByRole('list', { name: 'Components', exact: true }).getByRole('button', { name: 'Welcome', exact: true }).click()
  await page.getByLabel('Greeting').fill('Good morning, <demo>')
  await welcome.getByText('Good morning, <demo>').waitFor()

  log('check a task in Preview: same draft becomes dirty, with the Edit hint')
  await page.getByRole('button', { name: 'Preview' }).click()
  const first = tasks.getByRole('checkbox').first()
  const wasChecked = await first.isChecked()
  await first.click()
  assert.equal(await first.isChecked(), !wasChecked)
  assert.match(await status(), /Switch to Edit to save or cancel them/)
  await page.getByRole('button', { name: 'Edit workspace' }).click()

  log('add, rename and delete tasks in Edit')
  await tasks.getByLabel('New task').fill('Ship FS-016')
  await tasks.getByLabel('New task').press('Enter')
  const renamed = tasks.getByLabel(/^Task text: Ship FS-016$/)
  await renamed.fill('Ship FS-016 today')
  await renamed.press('Enter')
  await tasks.getByRole('button', { name: `Delete task "${starter[starter.length - 1]}"` }).click()
  const expected = await taskTexts()
  assert.ok(expected.includes('Ship FS-016 today') && !expected.includes(starter[starter.length - 1]))
  const doneState = await tasks.getByRole('checkbox').evaluateAll((els) => els.map((e) => e.checked))

  log('Save, log out, log in: everything is the same')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('All changes saved').waitFor()
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('heading', { name: 'Sign in to your workspace' }).waitFor()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('list', { name: 'Components' }).waitFor()
  assert.deepEqual(await taskTexts(), expected)
  assert.deepEqual(await tasks.getByRole('checkbox').evaluateAll((els) => els.map((e) => e.checked)), doneState)
  await welcome.getByText('Good morning, <demo>').waitFor()
  assert.equal(await welcome.locator('demo').count(), 0, 'greeting markup stays literal text')
  assert.equal(await status(), 'All changes saved')

  console.log('\nOK: real browser Welcome/Tasks persistence passes')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
