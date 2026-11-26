// Real-browser check: hiding or removing a card in a grid closes the space it leaves (the cards below move up),
// Undo brings the layout back exactly, showing it again never overlaps, and Save and reload keep the result.
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
const card = (name) => page.getByRole('article', { name, exact: true }).first()
// Positions relative to the grid's own top-left, so a shift of the whole page (scroll, banners) cannot matter.
const boxes = () =>
  page.evaluate(() => {
    const grid = document.querySelector('.react-grid-layout')?.getBoundingClientRect()
    return Object.fromEntries([...document.querySelectorAll('.react-grid-item:not(.react-grid-placeholder) [data-widget-id]')].map((e) => {
      const r = e.getBoundingClientRect()
      return [e.querySelector('h3')?.textContent, { x: Math.round(r.x - grid.x), y: Math.round(r.y - grid.y), w: Math.round(r.width), h: Math.round(r.height) }]
    }))
  })
const settle = () => page.waitForTimeout(1000)
const overlapping = (b) => {
  const e = Object.entries(b)
  return e.some(([n, p], i) => e.slice(i + 1).some(([, q]) => p.x < q.x + q.w - 1 && q.x < p.x + p.w - 1 && p.y < q.y + q.h - 1 && q.y < p.y + p.h - 1 && n))
}

try {
  log('register: Welcome on top, Tasks and Notes below it')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await settle()
  const original = await boxes()
  assert.ok(original.Tasks.y > original.Welcome.y, 'Tasks starts below Welcome')

  log('hide Welcome: the space it took closes and Tasks and Notes move up to the top')
  await card('Welcome').click({ position: { x: 60, y: 12 } })
  await goTo(page, 'My workspace')
  await inspector(page).getByRole('button', { name: 'Hide widget' }).click()
  await settle()
  const hidden = await boxes()
  assert.equal(hidden.Welcome, undefined, 'Welcome is gone from the canvas')
  assert.ok(hidden.Tasks.y < original.Tasks.y - 40, `Tasks moved up (${original.Tasks.y} -> ${hidden.Tasks.y})`)
  assert.equal(hidden.Tasks.y, original.Welcome.y, 'Tasks now sits where Welcome was')
  assert.equal(hidden.Notes.y, hidden.Tasks.y)
  assert.equal(overlapping(hidden), false)
  assert.equal(hidden.Tasks.w, original.Tasks.w, 'sizes are unchanged')

  log('one Undo brings Welcome and the old positions back exactly')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await settle()
  assert.deepEqual(await boxes(), original)

  log('show it again after hiding: it is placed without overlapping anything')
  await card('Welcome').click({ position: { x: 60, y: 12 } })
  await goTo(page, 'My workspace')
  await inspector(page).getByRole('button', { name: 'Hide widget' }).click()
  await settle()
  await inspector(page).getByRole('button', { name: 'Show widget' }).click()
  await settle()
  const shown = await boxes()
  assert.ok(shown.Welcome, 'Welcome is back')
  assert.equal(overlapping(shown), false)

  log('remove a card with the trash button: its space closes too, and Save and reload keep the result')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await settle()
  await card('Tasks').getByRole('button', { name: 'Remove Tasks' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove widget' }).click()
  await settle()
  const removed = await boxes()
  assert.equal(removed.Tasks, undefined)
  assert.equal(overlapping(removed), false)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await inspector(page).waitFor()
  await settle()
  assert.deepEqual(await boxes(), removed)

  console.log('OK: hiding or removing a card closes its gap; Undo, show and Save behave')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
