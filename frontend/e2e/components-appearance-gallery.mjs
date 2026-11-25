// Real-browser, real-backend check of the redesigned component library, Appearance panel and
// template gallery (UI-008 to UI-010). Not part of `npm test`. Same prerequisites as grid-gesture.mjs.
// Run: node e2e/components-appearance-gallery.mjs (also part of `npm run test:browser`).
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

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
  const library = panel.getByRole('list', { name: 'Component library' }).getByRole('listitem')
  assert.equal(await library.count(), 6)
  await panel.getByLabel('Search components').fill('calendar')
  assert.equal(await library.count(), 1)
  await panel.getByLabel('Search components').fill('zzzz')
  await panel.getByText('No components match.').waitFor()
  await panel.getByRole('button', { name: 'Clear search and filter' }).click()
  await panel.getByRole('button', { name: 'Productivity', exact: true }).click()
  assert.equal(await library.count(), 2)
  await panel.getByRole('button', { name: 'All', exact: true }).click()
  assert.equal(await status(), 'All changes saved')
  assert.equal((await widgetIds()).length, start.length)

  log('components: one click adds exactly one widget of each type and selects it')
  for (const type of ['Welcome', 'Tasks', 'Notes', 'Gallery', 'Analytics', 'Calendar']) {
    const before = (await widgetIds()).length
    await panel.getByRole('button', { name: `Add ${type}`, exact: true }).click()
    await page.waitForFunction((n) => document.querySelectorAll('[data-widget-id]').length === n, before + 1)
  }
  await panel.getByRole('button', { name: 'Edit properties' }).click()
  await panel.getByRole('heading', { name: 'Properties' }).waitFor()
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
  await panel.getByRole('button', { name: 'Add Tasks', exact: true }).click()
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
  for (const [label, value] of [['Page background', '#ffffff'], ['Card background', '#ffffff'], ['Text color', '#ffffff']]) {
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

  log('templates: three distinct config-drawn pictures; previewing and snapshotting never dirty the draft')
  await goTo(page, 'Templates')
  await panel.getByText(/Start from a ready-made design/).waitFor()
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="template-thumbnail"]').length === 3)
  const looks = await page.locator('[data-testid="template-thumbnail"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-placement')}|${e.getAttribute('style')}`))
  assert.equal(new Set(looks).size, 3)
  await panel.getByRole('radio', { name: /Creative/ }).check()
  await panel.getByRole('region', { name: 'Creative preview' }).waitFor()
  assert.equal(await status(), 'All changes saved')
  await panel.getByLabel('Template name').fill('Gallery snapshot')
  await panel.getByRole('button', { name: 'Save current design as template' }).click()
  await panel.getByText(/Your workspace was not changed/).waitFor()
  assert.equal(await status(), 'All changes saved')

  log('templates: custom details load lazily and get a picture; apply is dirty until Save, Cancel restores')
  const before = await page.locator('[data-testid="template-thumbnail"]').count()
  await panel.getByRole('radio', { name: /Gallery snapshot/ }).check()
  await panel.getByRole('region', { name: 'Gallery snapshot preview' }).waitFor()
  assert.ok((await page.locator('[data-testid="template-thumbnail"]').count()) > before)
  await panel.getByRole('radio', { name: /Creative/ }).check()
  await panel.getByRole('button', { name: 'Apply Creative' }).click()
  await panel.getByText(/Creative is now in your draft/).waitFor()
  assert.equal(await status(), 'Unsaved changes')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  assert.equal(await themed('--fs-primary'), '#15803d')

  log('templates: delete confirms in a dialog, Escape returns focus to the Delete button')
  const remove = panel.getByRole('button', { name: 'Delete template Gallery snapshot' })
  await remove.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog')
  await dialog.waitFor()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Keep template')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Delete template Gallery snapshot')
  await remove.click()
  await dialog.getByRole('button', { name: 'Delete template', exact: true }).click()
  await panel.getByText(/Deleted "Gallery snapshot"/).waitFor()

  log('narrow desktop: nothing overflows the 1024px inspector')
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.waitForTimeout(1200)
  for (const view of ['Components', 'Appearance', 'Templates']) {
    await goTo(page, view)
    await page.waitForTimeout(400)
    const overflow = await panel.evaluate((el) => ({ inner: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth }))
    assert.deepEqual(overflow, { inner: 0, page: 0 }, `${view} overflows at 1024px`)
  }

  console.log('\nOK: real browser components, appearance and template gallery pass')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
