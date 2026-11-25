// Real-browser, real-backend check of bounded Undo/Redo (FS-027): one typed edit, one colour drag, one
// section drag and one template application are one step each; Undo and Redo send no network writes;
// Save does not erase history; Cancel does. Not part of `npm test`. Same prerequisites as
// grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector, templates } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const writes = []
page.on('request', (request) => {
  if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
})

const settings = inspector(page)
const undo = page.getByRole('button', { name: 'Undo', exact: true })
const redo = page.getByRole('button', { name: 'Redo', exact: true })
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const sectionTitles = () => page.locator('[data-section-id] > div > h2').allInnerTexts()
const note = () => page.locator('textarea').first()
const ids = () => page.evaluate(() => [...document.querySelectorAll('[data-widget-id]')].map((e) => e.getAttribute('data-widget-id')))

try {
  log('register: a fresh workspace has nothing to undo')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  assert.ok(await undo.isDisabled())
  assert.ok(await redo.isDisabled())
  writes.length = 0

  log('typing a sentence is one step: one Undo takes it all back, Redo returns it')
  const original = await note().inputValue()
  await note().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' typed in one go, several words long')
  const typed = await note().inputValue()
  assert.notEqual(typed, original)
  await undo.click()
  assert.equal(await note().inputValue(), original)
  assert.ok(await undo.isDisabled())
  assert.equal(await status(), 'All changes saved')
  await redo.click()
  assert.equal(await note().inputValue(), typed)
  await undo.click()

  log('one drag of the colour picker is one step')
  await goTo(page, 'Appearance')
  const swatchBefore = await page.evaluate(() => getComputedStyle(document.querySelector('.fs-themed')).getPropertyValue('--fs-primary'))
  await settings.getByRole('button', { name: /^Pick/ }).first().click()
  const area = page.locator('.react-colorful__saturation').first()
  const box = await area.boundingBox()
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.08), box.y + box.height * (0.3 + i * 0.05))
  await page.mouse.up()
  const swatchAfter = await page.evaluate(() => getComputedStyle(document.querySelector('.fs-themed')).getPropertyValue('--fs-primary'))
  assert.notEqual(swatchAfter, swatchBefore)
  await undo.click()
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.fs-themed')).getPropertyValue('--fs-primary')), swatchBefore)
  assert.ok(await undo.isDisabled(), 'the whole drag was a single step')
  await redo.click()
  await undo.click()

  log('a section drag by keyboard is one step')
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  await page.getByRole('button', { name: 'Reorder section Today' }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  assert.deepEqual(await sectionTitles(), ['Reference', 'Today'])
  await undo.click()
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  assert.ok(await undo.isDisabled())
  await redo.click()
  assert.deepEqual(await sectionTitles(), ['Reference', 'Today'])

  log('Ctrl+Z and Ctrl+Shift+Z work outside text fields, and leave text fields to the browser')
  await page.locator('h1').click()
  await page.keyboard.press('Control+z')
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  await page.keyboard.press('Control+Shift+z')
  assert.deepEqual(await sectionTitles(), ['Reference', 'Today'])
  await page.keyboard.press('Control+z')

  log('applying a template is one step; Undo brings back the very same widgets')
  const before = await ids()
  await goTo(page, 'Templates')
  const gallery = templates(page)
  await gallery.getByRole('radio', { name: /Creative/ }).check()
  await gallery.getByRole('button', { name: 'Apply Creative' }).click()
  const confirm = page.getByRole('region', { name: 'Replace your unsaved changes?' }).getByRole('button', { name: 'Replace my draft' })
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await gallery.getByText(/Creative is now in your draft/).waitFor()
  await page.keyboard.press('Escape')
  await gallery.waitFor({ state: 'hidden' })
  assert.deepEqual(await sectionTitles(), ['Studio', 'Ideas', 'Archive'])
  await undo.click()
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  assert.deepEqual(await ids(), before)
  assert.equal(await status(), 'All changes saved')
  await redo.click()
  assert.deepEqual(await sectionTitles(), ['Studio', 'Ideas', 'Archive'])

  log('Undo and Redo never sent anything to the server')
  assert.deepEqual(writes, [])

  log('Save keeps the history; Undo afterwards makes the workspace unsaved again')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  assert.equal(writes.filter((w) => w.startsWith('PUT')).length, 1)
  assert.ok(await undo.isEnabled())
  await undo.click()
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  assert.equal(await status(), 'Unsaved changes')
  assert.equal(writes.filter((w) => w.startsWith('PUT')).length, 1, 'Undo did not save')

  log('Cancel clears the history')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  assert.deepEqual(await sectionTitles(), ['Studio', 'Ideas', 'Archive']) // the saved version
  assert.ok(await undo.isDisabled())
  assert.ok(await redo.isDisabled())

  log('after a reload there is no history either')
  await page.reload()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  assert.ok(await undo.isDisabled())

  console.log('\nOK: real browser undo and redo pass')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
