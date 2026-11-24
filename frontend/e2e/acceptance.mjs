// The brief's demonstration acceptance run, in a real browser against the real backend (FS-028):
// two accounts, two tabs, save/logout/login restoration, Cancel, templates, stale-tab conflict,
// unknown widget types and a newer schema. The per-group drag mechanics have their own scripts
// (see docs/handoff.md); this one proves the scenario end to end. Not part of `npm test`.
// Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'
const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`
const emailA = `demoa${stamp}@example.com`
const emailB = `demob${stamp}@example.com`

const browser = await chromium.launch({ executablePath })
const context = await browser.newContext({ viewport: { width: 1600, height: 1400 } })
const page = await context.newPage()
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const settings = (p) => inspector(p)
const components = (p) => inspector(p)
const status = (p) => p.getByRole('status', { name: 'Save status' }).innerText()
const sectionTitles = (p) => p.locator('[data-section-id] > div > h2').allInnerTexts()
const note = (p) => p.locator('[data-widget-id="w-notes"] textarea') // a stable pick: sections are reordered during the run
const api = (p, path) => p.evaluate(async (x) => {
  const response = await fetch(`/api${x}`, { credentials: 'same-origin' })
  return { status: response.status, body: await response.json().catch(() => null) }
}, path)
const saveAndWait = async (p) => {
  await p.getByRole('button', { name: 'Save', exact: true }).click()
  await p.getByText('All changes saved').waitFor()
}

async function register(p, email) {
  await p.goto(baseUrl)
  await p.getByRole('button', { name: 'Create an account' }).click()
  await p.getByLabel('Email').fill(email)
  await p.getByLabel('Password').fill(PASSWORD)
  await p.getByRole('button', { name: 'Create account' }).click()
  await inspector(p).waitFor()
}
async function login(p, email) {
  await p.getByLabel('Email').fill(email)
  await p.getByLabel('Password').fill(PASSWORD)
  await p.getByRole('button', { name: 'Sign in', exact: true }).click()
  await inspector(p).waitFor()
}
async function applyTemplate(p, name, confirmReplace = true) {
  await goTo(p, 'Templates')
  await settings(p).getByRole('radio', { name: new RegExp(name) }).check()
  await settings(p).getByRole('button', { name: `Apply ${name}` }).click()
  const dialog = p.getByRole('alertdialog')
  if (confirmReplace && (await dialog.isVisible().catch(() => false))) await dialog.getByRole('button', { name: 'Replace my draft' }).click()
  await settings(p).getByText(new RegExp(`${name} is now in your draft`)).waitFor()
}
async function cancelChanges(p) {
  await p.getByRole('button', { name: 'Cancel', exact: true }).click()
  await p.getByRole('button', { name: 'Discard changes' }).click()
}

try {
  log('AC-02: anonymous access to a workspace is 401')
  const anonymous = await browser.newContext()
  assert.equal((await anonymous.request.get(`${baseUrl}/api/workspace`)).status(), 401)
  assert.equal((await anonymous.request.get(`${baseUrl}/api/templates`)).status(), 401)
  await anonymous.close()

  log('1. register A: the Productivity workspace opens in Edit')
  await register(page, emailA)
  assert.deepEqual(await sectionTitles(page), ['Today', 'Reference'])
  assert.equal(await status(page), 'All changes saved')

  log('2. add a widget, edit text and note content, change colours and fonts, switch navigation placement')
  const widgetsBefore = await page.locator('[data-widget-id]').count()
  await goTo(page, 'Components')
  await components(page).getByRole('button', { name: /^Add Calendar/ }).click()
  assert.equal(await page.locator('[data-widget-id]').count(), widgetsBefore + 1)
  const noteText = `Demo note ${stamp}`
  await note(page).fill(noteText)
  await goTo(page, 'Appearance')
  await settings(page).getByLabel('Primary color').fill('#0e7490')
  await settings(page).getByLabel('Base font size (px)').fill('18')
  await settings(page).getByLabel('Font family').selectOption({ index: 1 })
  await goTo(page, 'Outline')
  for (const placement of ['top', 'left', 'right']) await components(page).getByLabel('Navigation placement').selectOption(placement)
  assert.equal(await status(page), 'Unsaved changes')

  log('3. reorder sections by keyboard, and move a navigation item to the other group with the Move buttons')
  await page.getByRole('button', { name: 'Reorder section Today' }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  assert.deepEqual(await sectionTitles(page), ['Reference', 'Today'])
  const nav = page.getByRole('navigation', { name: 'Workspace' })
  await nav.getByRole('button', { name: 'Reference', exact: true }).click() // selects the item in Edit
  await goTo(page, 'My workspace')
  await settings(page).getByRole('button', { name: 'Move to Secondary' }).click()
  assert.equal(await nav.getByRole('list', { name: 'Secondary navigation' }).getByRole('button', { name: 'Reference', exact: true }).count(), 1)

  log('4. hide and show a widget, remove another, switch Preview and Edit: the draft stays intact')
  const stamped = await page.evaluate(() => [...document.querySelectorAll('[data-widget-id]')].map((e) => e.getAttribute('data-widget-id')))
  await page.locator('[data-widget-id]').nth(1).click({ position: { x: 4, y: 4 } })
  await goTo(page, 'My workspace')
  await settings(page).getByRole('button', { name: 'Hide widget' }).click()
  assert.equal(await page.locator('[data-widget-id]').count(), stamped.length - 1)
  assert.equal(await settings(page).getByRole('button', { name: 'Show widget' }).count(), 1, 'a hidden widget stays selected and can be shown again')
  await settings(page).getByRole('button', { name: 'Show widget' }).click()
  assert.equal(await page.locator('[data-widget-id]').count(), stamped.length)
  await page.locator('[data-widget-id]').nth(2).click({ position: { x: 4, y: 4 } })
  await settings(page).getByRole('button', { name: 'Remove widget' }).click()
  const removeDialog = page.getByRole('alertdialog')
  if (await removeDialog.isVisible().catch(() => false)) await removeDialog.getByRole('button', { name: /^Remove/ }).click()
  assert.equal(await page.locator('[data-widget-id]').count(), stamped.length - 1)
  const draftBeforePreview = { sections: await sectionTitles(page), note: await note(page).inputValue(), widgets: await page.locator('[data-widget-id]').count() }
  const writesBefore = []
  page.on('request', (request) => { if (request.url().includes('/api/') && request.method() !== 'GET') writesBefore.push(request.method()) })
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  assert.equal(await page.getByRole('complementary').count(), 0, 'Preview removes the builder chrome')
  await page.getByRole('button', { name: 'Edit workspace' }).click()
  assert.deepEqual({ sections: await sectionTitles(page), note: await note(page).inputValue(), widgets: await page.locator('[data-widget-id]').count() }, draftBeforePreview)
  assert.deepEqual(writesBefore, [], 'switching modes sends no write')

  log('5. Save, log out, log in: the whole workspace is restored')
  await saveAndWait(page)
  const saved = (await api(page, '/workspace')).body
  assert.equal(saved.config.navigation.placement, 'right')
  assert.equal(saved.config.theme.primary, '#0e7490')
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByLabel('Email').waitFor()
  assert.equal((await api(page, '/workspace')).status, 401, 'logout ended the server session')
  await login(page, emailA)
  const restored = (await api(page, '/workspace')).body
  assert.deepEqual(restored.config, saved.config)
  assert.equal(restored.revision, saved.revision)
  assert.deepEqual(await sectionTitles(page), ['Reference', 'Today'])
  assert.equal(await note(page).inputValue(), noteText)
  assert.equal(await status(page), 'All changes saved')

  log('6. change the theme and Cancel; reload: the saved version remains')
  await goTo(page, 'Appearance')
  await settings(page).getByLabel('Primary color').fill('#be123c')
  assert.equal(await status(page), 'Unsaved changes')
  await cancelChanges(page)
  await page.reload()
  await inspector(page).waitFor()
  assert.equal((await api(page, '/workspace')).body.config.theme.primary, '#0e7490')
  await goTo(page, 'Appearance')
  assert.equal(await settings(page).getByLabel('Primary color').inputValue(), '#0e7490')

  log('7. save a private custom template; apply Creative and Cancel; apply Analytics and Save; restore default and Cancel')
  await goTo(page, 'Templates')
  await settings(page).getByLabel('Template name').fill('Demo design')
  await settings(page).getByRole('button', { name: 'Save current design as template' }).click()
  await settings(page).getByText(/Saved "Demo design"/).waitFor()
  assert.equal((await api(page, '/workspace')).body.revision, saved.revision, 'saving a template did not save the workspace')
  const customId = (await api(page, '/templates')).body.items.find((i) => i.kind === 'custom').id
  await applyTemplate(page, 'Creative')
  assert.deepEqual(await sectionTitles(page), ['Studio', 'Ideas', 'Archive'])
  await cancelChanges(page)
  assert.deepEqual(await sectionTitles(page), ['Reference', 'Today'])
  await applyTemplate(page, 'Analytics')
  assert.deepEqual(await sectionTitles(page), ['Overview', 'Reports', 'Notes'])
  await saveAndWait(page)
  assert.equal((await api(page, '/workspace')).body.config.title, 'Analytics workspace')
  await settings(page).getByRole('button', { name: 'Restore default' }).click()
  const restoreDialog = page.getByRole('alertdialog')
  if (await restoreDialog.isVisible().catch(() => false)) await restoreDialog.getByRole('button', { name: 'Replace my draft' }).click()
  await settings(page).getByText(/default Productivity design is now in your draft/).waitFor()
  assert.deepEqual(await sectionTitles(page), ['Today', 'Reference'])
  await cancelChanges(page)
  assert.deepEqual(await sectionTitles(page), ['Overview', 'Reports', 'Notes'])
  const analyticsSaved = (await api(page, '/workspace')).body

  log('8a. B is isolated: its own Productivity workspace, no custom template, 404 for A\'s template')
  const contextB = await browser.newContext({ viewport: { width: 1600, height: 1400 } })
  const pageB = await contextB.newPage()
  await register(pageB, emailB)
  assert.deepEqual(await sectionTitles(pageB), ['Today', 'Reference'])
  assert.equal((await api(pageB, '/workspace')).body.config.title, 'My workspace')
  assert.equal((await api(pageB, '/templates')).body.items.filter((i) => i.kind === 'custom').length, 0)
  assert.equal((await api(pageB, `/templates/${customId}`)).status, 404)
  await contextB.close()

  log('8b. two tabs: the stale save receives a conflict and never overwrites the first')
  const tab2 = await context.newPage()
  await tab2.goto(baseUrl)
  await inspector(tab2).waitFor()
  assert.equal((await api(tab2, '/workspace')).body.revision, analyticsSaved.revision)
  await goTo(page, 'My workspace')
  await page.getByLabel('Workspace title').fill('Saved from tab one')
  await saveAndWait(page)
  await tab2.getByLabel('Workspace title').fill('Stale edit from tab two')
  await tab2.getByRole('button', { name: 'Save', exact: true }).click()
  const conflict = tab2.getByRole('alert').filter({ hasText: /revision/i })
  await conflict.waitFor()
  assert.equal((await api(page, '/workspace')).body.config.title, 'Saved from tab one', 'the stale save did not overwrite')
  assert.equal(await tab2.getByLabel('Workspace title').inputValue(), 'Stale edit from tab two', 'the stale draft is kept')
  await tab2.getByRole('button', { name: 'Keep editing' }).click()
  await tab2.getByRole('button', { name: 'Save', exact: true }).click()
  await conflict.waitFor()
  assert.equal((await api(page, '/workspace')).body.config.title, 'Saved from tab one', 'saving again still does not overwrite')
  await tab2.getByRole('button', { name: 'Reload latest' }).click()
  await tab2.getByRole('alertdialog').getByRole('button', { name: 'Discard and reload' }).click()
  await tab2.getByText('All changes saved').waitFor()
  assert.equal(await tab2.getByLabel('Workspace title').inputValue(), 'Saved from tab one')
  await tab2.close()

  log('AC-12a: an unknown widget type shows a safe placeholder and its data survives later saves')
  const csrf = await page.evaluate(async () => (await (await fetch('/api/auth/me', { credentials: 'same-origin' })).json()).csrfToken)
  const current = (await api(page, '/workspace')).body
  const withUnknown = structuredClone(current.config)
  const stack = withUnknown.sections.find((s) => s.kind === 'stack')
  stack.widgets.push({ id: 'w-mystery', type: 'sparkline', title: 'Mystery', props: { keep: 'me', n: [1, 2, 3] } })
  const put = await page.evaluate(async ({ baseRevision, config, token }) => {
    const response = await fetch('/api/workspace', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ baseRevision, config }) })
    return response.status
  }, { baseRevision: current.revision, config: withUnknown, token: csrf })
  assert.equal(put, 200)
  await page.reload()
  await inspector(page).waitFor()
  assert.equal(await page.locator('[data-unsupported="true"]').count(), 1)
  assert.match(await page.locator('[data-unsupported="true"]').innerText(), /sparkline/)
  await page.getByLabel('Workspace title').fill('Edited with an unknown widget present')
  await saveAndWait(page)
  const kept = (await api(page, '/workspace')).body.config.sections.flatMap((s) => s.widgets).find((w) => w.id === 'w-mystery')
  assert.deepEqual({ id: kept.id, type: kept.type, title: kept.title, props: kept.props }, { id: 'w-mystery', type: 'sparkline', title: 'Mystery', props: { keep: 'me', n: [1, 2, 3] } }) // standard defaults may be added around it

  log('AC-12b: a newer unsupported schema opens no writable editor')
  const newer = { id: 'ws-future', revision: 9, updatedAt: '2030-01-01T00:00:00Z', config: { schemaVersion: 2, title: 'From the future', sections: [] } }
  await page.route('**/api/workspace', (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(newer) }) : route.continue()))
  await page.reload()
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').innerText(), /newer version|not supported|unsupported/i)
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0)
  assert.equal(await page.getByRole('list', { name: 'Components' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Edit workspace' }).count(), 0)
  await page.unroute('**/api/workspace')
  await page.reload()
  await inspector(page).waitFor()
  assert.equal((await api(page, '/workspace')).body.config.title, 'Edited with an unknown widget present', 'nothing was replaced')

  console.log('\nOK: real browser demonstration acceptance run passes')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
