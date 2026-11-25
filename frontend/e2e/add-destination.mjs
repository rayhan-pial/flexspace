// Real-browser, real-backend check of the Add component dialog (UI-023): a visible destination selector,
// one Add = one widget in the shown section (below the fold included), then the dialog closes, Properties
// open and the new card is scrolled into view and focused; Undo, Save and reload reproduce the result.
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector, library } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const puts = []
page.on('request', (request) => {
  if (request.url().includes('/api/') && request.method() !== 'GET') puts.push(`${request.method()} ${new URL(request.url()).pathname}`)
})
const sectionWidgets = (title) =>
  page.evaluate((name) => {
    const section = [...document.querySelectorAll('[data-section-id]')].find((el) => el.querySelector('h2')?.textContent?.trim() === name)
    return section ? [...section.querySelectorAll('[data-widget-id]')].map((el) => el.getAttribute('data-widget-id')) : null
  }, title)
const inViewport = (id) =>
  page.evaluate((widgetId) => {
    const r = document.querySelector(`[data-widget-id="${widgetId}"]`)?.getBoundingClientRect()
    return !!r && r.bottom > 0 && r.top < innerHeight
  }, id)
const focusedWidget = () => page.evaluate(() => document.activeElement?.getAttribute('data-widget-id') ?? null)

try {
  log('register: the default workspace has Today (grid) and Reference (stack)')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  assert.equal(await status(), 'All changes saved')

  log('the dialog names its destination and kind before Add, and searching/choosing changes nothing')
  puts.length = 0
  await goTo(page, 'Components')
  const dialog = library(page)
  const select = dialog.getByLabel('Add to section')
  const options = await select.locator('option').allInnerTexts()
  assert.deepEqual(options, ['Today · dashboard grid', 'Reference · stack'])
  await select.selectOption({ label: 'Reference · stack' })
  await dialog.getByText(/Adding to Reference \(stack\)\. It goes to the end of the stack/).waitFor()
  await dialog.getByLabel('Search components').fill('calendar')
  assert.equal(await status(), 'All changes saved')
  assert.equal(puts.length, 0)
  await dialog.getByLabel('Search components').fill('')

  log('Add to the section below the fold: the dialog closes, Properties open, and the new card is in view and focused')
  const before = await sectionWidgets('Reference')
  assert.equal(await inViewport(before[0]), false, 'Reference starts below the fold in this window')
  await dialog.getByRole('button', { name: 'Add Notes', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  const after = await sectionWidgets('Reference')
  assert.equal(after.length, before.length + 1, 'exactly one widget was added, to Reference')
  const added = after.find((id) => !before.includes(id))
  await page.waitForFunction((id) => document.activeElement?.getAttribute('data-widget-id') === id, added)
  assert.equal(await inViewport(added), true, 'the new card was scrolled into view')
  assert.equal(await focusedWidget(), added)
  await inspector(page).getByRole('heading', { name: 'Properties' }).waitFor()
  await inspector(page).getByTestId('add-confirmation').getByText(/Added Notes to Reference \(stack\)/).waitFor()
  assert.equal(await status(), 'Unsaved changes')
  assert.equal(puts.length, 0, 'adding saved nothing')

  log('Add to the grid: one widget, a real position, no overlap with its neighbours')
  await goTo(page, 'Components')
  await library(page).getByLabel('Add to section').selectOption({ label: 'Today · dashboard grid' })
  const todayBefore = await sectionWidgets('Today')
  await library(page).getByRole('button', { name: 'Add Tasks', exact: true }).click()
  await library(page).waitFor({ state: 'hidden' })
  const todayAfter = await sectionWidgets('Today')
  assert.equal(todayAfter.length, todayBefore.length + 1)
  const gridId = todayAfter.find((id) => !todayBefore.includes(id))
  await page.waitForFunction((id) => document.activeElement?.getAttribute('data-widget-id') === id, gridId)
  await page.waitForTimeout(900) // the grid re-measures after layout changes
  const rects = await page.evaluate(() => [...document.querySelectorAll('[data-section-id] .react-grid-item:not(.react-grid-placeholder)')].map((e) => e.getBoundingClientRect()))
  for (const [i, p] of rects.entries()) for (const q of rects.slice(i + 1)) {
    assert.ok(p.right <= q.left + 1 || q.right <= p.left + 1 || p.bottom <= q.top + 1 || q.bottom <= p.top + 1, 'no overlap in the grid')
  }

  log('Undo removes the last add, one step at a time; Save and reload keep what remains exactly where it was added')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.deepEqual(await sectionWidgets('Today'), todayBefore)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  assert.deepEqual(await sectionWidgets('Today'), todayAfter)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await inspector(page).waitFor()
  await page.waitForTimeout(600)
  assert.deepEqual(await sectionWidgets('Today'), todayAfter)
  assert.deepEqual(await sectionWidgets('Reference'), after)

  log('Escape closes the dialog without any change and returns focus to the Components button')
  await goTo(page, 'Components')
  await page.keyboard.press('Escape')
  await library(page).waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('title')), 'Components')
  assert.equal(await status(), 'All changes saved')

  console.log('OK: Add component dialog shows its destination, reveals the new card and keeps Undo, Save and reload exact')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
