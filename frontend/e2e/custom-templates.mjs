// Real-browser, real-backend check of private custom templates (FS-025): snapshot from a dirty draft
// without touching the workspace, listing after reload, applying with fresh ids, privacy between
// accounts, and deleting. Not part of `npm test`. Same prerequisites as grid-gesture.mjs.
// Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector, templates } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const settings = (p) => templates(p) // the Templates dialog
const sectionTitles = (page) => page.locator('[data-section-id] > div > h2').allInnerTexts()
const widgetIds = (page) => page.evaluate(() => [...document.querySelectorAll('[data-widget-id]')].map((e) => e.getAttribute('data-widget-id')))
const api = (page, path) => page.evaluate(async (p) => {
  const response = await fetch(`/api${p}`, { credentials: 'same-origin' })
  return { status: response.status, body: await response.json().catch(() => null) }
}, path)

async function register(page) {
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
}

async function openTemplates(page, tab = 'My templates') {
  await goTo(page, 'Templates')
  await settings(page).getByText(/Start from a ready-made design/).waitFor()
  await settings(page).getByRole('tab', { name: tab }).click()
}

try {
  const contextA = await browser.newContext({ viewport: { width: 1800, height: 2400 } })
  const a = await contextA.newPage()
  log('account A registers and applies Creative, leaving a dirty draft')
  await register(a)
  await openTemplates(a, 'Ready-made')
  await settings(a).getByRole('radio', { name: /Creative/ }).check()
  await settings(a).getByRole('button', { name: 'Apply Creative' }).click()
  await settings(a).getByText(/Creative is now in your draft/).waitFor()
  await settings(a).getByRole('tab', { name: 'My templates' }).click()
  assert.deepEqual(await sectionTitles(a), ['Studio', 'Ideas', 'Archive'])
  const before = (await api(a, '/workspace')).body.revision

  log('saving a snapshot of the dirty draft leaves the workspace revision and draft alone')
  assert.ok(await settings(a).getByText(/You have no saved templates yet/).isVisible())
  await settings(a).getByLabel('Template name').fill('Studio copy')
  await settings(a).getByRole('button', { name: 'Save current design as template' }).click()
  await settings(a).getByText(/Saved "Studio copy" to your templates/).waitFor()
  assert.equal((await api(a, '/workspace')).body.revision, before)
  assert.equal(await a.getByRole('status', { name: 'Save status' }).innerText(), 'Unsaved changes')
  assert.deepEqual(await sectionTitles(a), ['Studio', 'Ideas', 'Archive'])

  log('after a reload the snapshot is listed under Your templates, and the saved workspace is still Productivity')
  await a.reload()
  await inspector(a).waitFor()
  assert.deepEqual(await sectionTitles(a), ['Today', 'Reference'])
  await openTemplates(a)
  await settings(a).getByRole('radio', { name: /Studio copy/ }).waitFor()
  const listed = (await api(a, '/templates')).body.items.filter((item) => item.kind === 'custom')
  assert.deepEqual(listed.map((item) => item.name), ['Studio copy'])
  const customId = listed[0].id

  log('applying it rebuilds the design with fresh ids, as a draft change')
  const savedIds = await widgetIds(a)
  await settings(a).getByRole('radio', { name: /Studio copy/ }).check()
  await settings(a).getByRole('button', { name: 'Apply Studio copy' }).click()
  await settings(a).getByText(/Studio copy is now in your draft/).waitFor()
  assert.deepEqual(await sectionTitles(a), ['Studio', 'Ideas', 'Archive'])
  const applied = await widgetIds(a)
  assert.equal(applied.length, 9)
  assert.ok(applied.every((id) => /^widget-[0-9a-f]{12}$/.test(id)))
  assert.equal(applied.filter((id) => savedIds.includes(id)).length, 0)
  assert.equal((await api(a, '/workspace')).body.revision, before)

  log('account B cannot see or read it')
  const contextB = await browser.newContext({ viewport: { width: 1800, height: 2400 } })
  const b = await contextB.newPage()
  await register(b)
  await openTemplates(b)
  assert.equal(await settings(b).getByRole('radio', { name: /Studio copy/ }).count(), 0)
  assert.ok(await settings(b).getByText(/You have no saved templates yet/).isVisible())
  assert.deepEqual((await api(b, '/templates')).body.items.filter((item) => item.kind === 'custom'), [])
  assert.equal((await api(b, `/templates/${customId}`)).status, 404)

  log('deleting it removes it for good and leaves the workspace and draft alone')
  const draftIds = await widgetIds(a)
  await settings(a).getByRole('button', { name: 'Delete template Studio copy' }).click()
  await a.getByRole('region', { name: 'Delete this template?' }).getByRole('button', { name: 'Delete template' }).click()
  await settings(a).getByText(/Deleted "Studio copy"/).waitFor()
  assert.equal(await settings(a).getByRole('radio', { name: /Studio copy/ }).count(), 0)
  assert.deepEqual(await widgetIds(a), draftIds)
  assert.equal((await api(a, '/workspace')).body.revision, before)
  assert.equal((await api(a, `/templates/${customId}`)).status, 404)
  assert.deepEqual((await api(a, '/templates')).body.items.filter((item) => item.kind === 'custom'), [])

  console.log('\nOK: real browser custom templates pass')
} catch (error) {
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
