// Real-browser, real-backend check of the redesigned component library, Appearance panel and
// template gallery (UI-008 to UI-010). Not part of `npm test`. Same prerequisites as grid-gesture.mjs.
// Run: node e2e/components-appearance-gallery.mjs (also part of `npm run test:browser`).
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector, library, templates } from './shell.mjs'

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

const panel = inspector(page)
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const widgetIds = () => page.evaluate(() => [...document.querySelectorAll('[data-widget-id]')].map((e) => e.getAttribute('data-widget-id')))
const themed = (name) => page.locator('.fs-themed').evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name)
const puts = []
page.on('request', (request) => {
  if (request.method() === 'PUT' && request.url().includes('/api/workspace')) puts.push(request.url())
})

try {
  log('register a new account')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await panel.waitFor()
  assert.equal(await status(), 'All changes saved')

  log('components: searching and filtering never dirty the draft')
  await goTo(page, 'Components')
  const start = await widgetIds()
  const lib = library(page)
  const cards = lib.getByRole('list', { name: 'Component library' }).getByRole('listitem')
  assert.equal(await cards.count(), 6)
  await lib.getByLabel('Search components').fill('calendar')
  assert.equal(await cards.count(), 1)
  await lib.getByLabel('Search components').fill('zzzz')
  await lib.getByText('No components match.').waitFor()
  await lib.getByRole('button', { name: 'Clear search and filter' }).click()
  await lib.getByRole('button', { name: 'Productivity', exact: true }).click()
  assert.equal(await cards.count(), 2)
  await page.keyboard.press('Escape')
  await lib.waitFor({ state: 'hidden' })
  assert.equal(await status(), 'All changes saved')
  assert.equal((await widgetIds()).length, start.length)

  log('components: one click adds exactly one widget of each type and selects it')
  for (const type of ['Welcome', 'Tasks', 'Notes', 'Gallery', 'Analytics', 'Calendar']) {
    const before = (await widgetIds()).length
    await goTo(page, 'Components')
    await library(page).getByRole('button', { name: `Add ${type}`, exact: true }).click()
    await library(page).waitFor({ state: 'hidden' })
    await page.waitForFunction((n) => document.querySelectorAll('[data-widget-id]').length === n, before + 1)
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-widget-id')) // revealed and focused
  }
  await panel.getByRole('heading', { name: 'Properties' }).waitFor() // each add closed the dialog and opened Properties
  assert.equal(await status(), 'Unsaved changes')

  log('components: Save then reload keeps the six new widgets; Cancel drops later additions')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  const saved = await widgetIds()
  assert.equal(saved.length, start.length + 6)
  await page.reload()
  await panel.waitFor()
  await page.waitForFunction((n) => document.querySelectorAll('[data-widget-id]').length === n, saved.length)
  await goTo(page, 'Components')
  await library(page).getByRole('button', { name: 'Add Tasks', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  assert.equal((await widgetIds()).length, saved.length)

  log('appearance: a palette is one Undo step and only the theme changes')
  await goTo(page, 'Appearance')
  const original = await themed('--fs-primary')
  puts.length = 0
  await panel.getByRole('button', { name: 'Use Midnight palette' }).click()
  assert.equal(await themed('--fs-background'), '#0f172a')
  assert.equal(await themed('--fs-primary'), '#818cf8')
  assert.equal(puts.length, 0, 'applying a palette must not save')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.equal(await themed('--fs-primary'), original)
  assert.equal(await status(), 'All changes saved')

  log('appearance: invalid hex is refused, extreme colors keep the editor readable and only warn')
  await panel.getByLabel('Primary color').fill('#12')
  await panel.getByText(/six hex digits/).waitFor()
  assert.equal(await themed('--fs-primary'), original)
  await panel.getByLabel('Primary color').blur()
  for (const [label, value] of [['Workspace background', '#ffffff'], ['Card background', '#ffffff'], ['Text color', '#ffffff']]) {
    await panel.getByLabel(label).fill(value)
  }
  await panel.getByText(/Text on cards: 1\.0:1 is low/).waitFor()
  const railColor = await page.getByRole('navigation', { name: 'Editor navigation' }).getByRole('button', { name: 'Appearance', exact: true }).evaluate((el) => getComputedStyle(el).color)
  assert.notEqual(railColor, 'rgb(255, 255, 255)', 'editor chrome must not follow the workspace theme')
  assert.equal(await themed('--fs-text'), '#ffffff', 'the colour is kept even though it warns')

  log('appearance: Save persists a palette across reload')
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  while (await undo.isEnabled()) await undo.click()
  assert.equal(await themed('--fs-primary'), original)
  await panel.getByRole('button', { name: 'Use Forest palette' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await panel.waitFor()
  assert.equal(await themed('--fs-primary'), '#15803d')

  log('templates: a large dialog with three distinct config-drawn pictures; previewing and snapshotting never dirty the draft')
  await goTo(page, 'Templates')
  const gallery = templates(page)
  await gallery.getByText(/Start from a ready-made design/).waitFor()
  assert.ok((await gallery.boundingBox()).width >= 900, 'the gallery dialog is wide (up to 960px), not the 304px inspector')
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="template-thumbnail"]').length === 3)
  const looks = await page.locator('[data-testid="template-thumbnail"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-placement')}|${e.getAttribute('style')}`))
  assert.equal(new Set(looks).size, 3)
  const columns = await gallery.locator('[data-template-grid]').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  assert.equal(columns, 3, 'three card columns at this width')
  await gallery.getByRole('radio', { name: /Creative/ }).check()
  await gallery.getByRole('region', { name: 'Creative preview' }).waitFor()
  assert.equal(await status(), 'All changes saved')
  await gallery.getByRole('tab', { name: 'My templates' }).click()
  await gallery.getByLabel('Template name').fill('Gallery snapshot')
  await gallery.getByRole('button', { name: 'Save current design as template' }).click()
  await gallery.getByText(/Your workspace was not changed/).waitFor()
  assert.equal(await status(), 'All changes saved')

  log('templates: custom details load lazily and get a picture; apply is dirty until Save, Cancel restores')
  const before = await page.locator('[data-testid="template-thumbnail"]').count()
  await gallery.getByRole('radio', { name: /Gallery snapshot/ }).check()
  await gallery.getByRole('region', { name: 'Gallery snapshot preview' }).waitFor()
  assert.ok((await page.locator('[data-testid="template-thumbnail"]').count()) > before)
  await gallery.getByRole('tab', { name: 'Ready-made' }).click()
  await gallery.getByRole('radio', { name: /Creative/ }).check()
  await gallery.getByRole('button', { name: 'Apply Creative' }).click()
  await gallery.getByText(/Creative is now in your draft/).waitFor()
  assert.equal(await status(), 'Unsaved changes')
  await page.keyboard.press('Escape')
  await gallery.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  assert.equal(await themed('--fs-primary'), '#15803d')

  log('templates: delete confirms inside the dialog, Escape cancels only the confirmation and returns focus to the Delete button')
  await goTo(page, 'Templates')
  await gallery.getByRole('tab', { name: 'My templates' }).click()
  await gallery.getByRole('radio', { name: /Gallery snapshot/ }).check()
  const remove = gallery.getByRole('button', { name: 'Delete template Gallery snapshot' })
  await remove.focus()
  await page.keyboard.press('Enter')
  const confirmation = gallery.getByRole('region', { name: 'Delete this template?' })
  await confirmation.waitFor()
  assert.equal(await page.getByRole('dialog').count(), 1, 'no second modal is stacked on the gallery')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Keep template')
  await page.keyboard.press('Escape')
  await confirmation.waitFor({ state: 'hidden' })
  assert.equal(await gallery.isVisible(), true, 'the gallery stays open')
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Delete template Gallery snapshot')
  await remove.click()
  await confirmation.getByRole('button', { name: 'Delete template', exact: true }).click()
  await gallery.getByText(/Deleted "Gallery snapshot"/).waitFor()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.startsWith('Deleted')), true, 'focus is on the result')
  await page.keyboard.press('Escape')
  await gallery.waitFor({ state: 'hidden' })

  log('narrow desktop: nothing overflows the 1024px inspector')
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.waitForTimeout(1200)
  for (const view of ['Appearance']) {
    await goTo(page, view)
    await page.waitForTimeout(400)
    const overflow = await panel.evaluate((el) => ({ inner: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth }))
    assert.deepEqual(overflow, { inner: 0, page: 0 }, `${view} overflows at 1024px`)
  }

  await goTo(page, 'Templates')
  await page.waitForTimeout(400)
  const fits = await templates(page).evaluate((el) => ({ inner: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth, columns: getComputedStyle(el.querySelector('[data-template-grid]')).gridTemplateColumns.split(' ').length }))
  assert.deepEqual({ inner: fits.inner, page: fits.page }, { inner: 0, page: 0 }, 'the gallery overflows at 1024px')
  assert.equal(fits.columns, 3, 'three columns at 1024px')
  await page.keyboard.press('Escape')

  console.log('\nOK: real browser components, appearance and template gallery pass')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
