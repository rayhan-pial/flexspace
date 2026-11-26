// Real-browser check: in Edit every section has its own "Add component to <section>" button under it (opening the Add
// dialog with that section already chosen), and from desktop width the top bar (Add component, Templates, Undo, ...)
// stays at the top while the page scrolls, with the inspector and section jumps sitting below it. Preview has no
// Add buttons; narrow screens keep the bar unpinned. Not part of `npm test`. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector, library, templates } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
const toolbar = page.locator('[data-toolbar]')
const sections = () => page.evaluate(() => [...document.querySelectorAll('[data-section-id]')].map((s) => ({ title: s.querySelector('h2')?.textContent?.trim(), count: s.querySelectorAll('[data-widget-id]').length })))

try {
  log('register and apply the Creative template: three sections, plenty of height to scroll')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Templates')
  await templates(page).getByRole('radio', { name: /Creative/ }).check()
  await templates(page).getByRole('button', { name: 'Apply Creative' }).click()
  await templates(page).getByText(/is now in your draft/).waitFor()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1000)
  const start = await sections()
  assert.deepEqual(start.map((s) => s.title), ['Studio', 'Ideas', 'Archive'])

  log('every section has its own Add component button under it')
  for (const s of start) assert.equal(await page.getByRole('button', { name: `Add component to ${s.title}` }).count(), 1, `button for ${s.title}`)

  log('the top bar stays pinned while scrolling: Add component, Templates, Undo and Save remain visible at the top')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(500)
  assert.ok((await page.evaluate(() => window.scrollY)) > 600, 'the page really scrolled far down')
  const bar = await toolbar.boundingBox()
  assert.ok(bar.y >= -1 && bar.y <= 2, `the bar is at the top of the window (y=${bar.y})`)
  for (const name of ['Add component', 'Templates', 'Undo', 'Save']) {
    const box = await toolbar.getByRole('button', { name, exact: true }).boundingBox()
    assert.ok(box && box.y >= 0 && box.y + box.height <= bar.height + 2, `${name} is visible in the pinned bar`)
  }
  const barBottom = bar.y + bar.height

  log('the inspector sits below the pinned bar instead of hiding under it')
  const insp = await inspector(page).boundingBox()
  assert.ok(insp.y >= barBottom - 1, `inspector top ${insp.y} is below the bar bottom ${barBottom}`)
  assert.ok(insp.y + insp.height <= 800 + 1, 'the inspector still fits in the window')

  log('scrolled down to the last section, its own button adds a component to it without scrolling up')
  const archiveButton = page.getByRole('button', { name: 'Add component to Archive' })
  await archiveButton.scrollIntoViewIfNeeded()
  await archiveButton.click()
  await library(page).waitFor()
  assert.match(await library(page).getByLabel('Add to section').evaluate((el) => el.selectedOptions[0].textContent), /^Archive/)
  const archiveBefore = (await sections()).find((s) => s.title === 'Archive').count
  await library(page).getByRole('button', { name: 'Add Notes', exact: true }).click()
  await library(page).waitFor({ state: 'hidden' })
  await page.waitForTimeout(900)
  const after = await sections()
  assert.equal(after.find((s) => s.title === 'Archive').count, archiveBefore + 1, 'the widget was added to Archive')
  assert.equal(after.find((s) => s.title === 'Studio').count, start[0].count)
  assert.equal(after.find((s) => s.title === 'Ideas').count, start[1].count)

  log('Escape from a section button closes the dialog and gives focus back to that button')
  await page.getByRole('button', { name: 'Add component to Ideas' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Add component to Ideas' }).click()
  assert.match(await library(page).getByLabel('Add to section').evaluate((el) => el.selectedOptions[0].textContent), /^Ideas/)
  await page.keyboard.press('Escape')
  await library(page).waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('Add component to Ideas')), true)

  log('the toolbar Add component keeps its normal default: the section of the selected widget (the one just added to Archive), not the last section button used')
  await toolbar.getByRole('button', { name: 'Add component', exact: true }).click()
  assert.match(await library(page).getByLabel('Add to section').evaluate((el) => el.selectedOptions[0].textContent), /^Archive/)
  await page.keyboard.press('Escape')

  log('jumping to a section from the navigation leaves its heading below the pinned bar')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Archive', exact: true }).click()
  await page.waitForTimeout(900)
  const heading = await page.locator('[data-section-id]').filter({ hasText: 'Archive' }).first().locator('h2').boundingBox()
  const bar2 = await toolbar.boundingBox()
  assert.ok(heading.y >= bar2.y + bar2.height - 2, `the Archive heading (${Math.round(heading.y)}) is not hidden under the bar (${Math.round(bar2.y + bar2.height)})`)

  log('Preview shows no Add buttons, and the bar is still pinned there')
  await toolbar.getByRole('button', { name: 'Preview', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: /^Add component to / }).count(), 0)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(400)
  const previewBar = await toolbar.boundingBox()
  assert.ok(previewBar.y >= -1 && previewBar.y <= 2, 'the Preview bar is pinned too')
  await toolbar.getByRole('button', { name: 'Edit workspace' }).click()

  log('below desktop width the bar is not pinned (it would eat the small screen) and there are no Add buttons')
  await page.setViewportSize({ width: 390, height: 800 })
  await page.waitForTimeout(600)
  await page.evaluate(() => window.scrollTo(0, 800))
  await page.waitForTimeout(300)
  assert.ok((await toolbar.boundingBox()).y < -100, 'the narrow bar scrolled away with the page')
  assert.equal(await page.getByRole('button', { name: /^Add component to / }).count(), 0)

  console.log('OK: per-section Add component buttons and a pinned top bar')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
