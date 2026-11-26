// A short, repeatable demonstration of the four revised behaviors for review (UI-030): automatic reflow when a
// widget is dropped on an occupied spot, one-cell steps that are disabled at their boundary with a reason, Add to a
// chosen section with the new card revealed, and a palette that fills the whole workspace. Records a video and a
// screenshot per moment into artifacts/ui-review/demo/ (git-untracked). Not part of `npm run test:browser`.
// Run: node e2e/management-demo.mjs   (needs the API and Vite dev server, like the other scripts)
import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, renameSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { goTo, inspector, library, templates } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'
const out = new URL('../../artifacts/ui-review/demo/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: out, size: { width: 1440, height: 900 } } })
const page = await context.newPage()
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
const shot = (name) => page.screenshot({ path: `${out}${name}.png` })
const card = (name) => page.getByRole('article', { name }).first()
const pause = (ms = 700) => page.waitForTimeout(ms)
const toolbar = page.locator('[data-toolbar]')

async function drag(from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 5, from.y + 5, { steps: 2 })
  await page.mouse.move(to.x, to.y, { steps: 24 })
  await pause(500)
}

try {
  log('sign up')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`demo${Date.now()}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await pause(1200)

  log('1. drop a widget on an occupied spot: its neighbors make room')
  await shot('1-reflow-before')
  const handle = await card('Notes').getByRole('heading', { level: 3 }).boundingBox()
  const tasks = await card('Tasks').boundingBox()
  await drag({ x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: tasks.x + 60, y: tasks.y + 20 })
  await shot('1-reflow-during')
  await page.mouse.up()
  await pause(900)
  await shot('1-reflow-after')
  await toolbar.getByRole('button', { name: 'Undo', exact: true }).click() // one Undo restores everything
  await pause(900)
  await shot('1-reflow-undone')

  log('2. one-cell steps are disabled at their boundary, with the reason shown')
  await card('Welcome').click({ position: { x: 60, y: 12 } })
  await inspector(page).getByText(/Unavailable now:/).waitFor()
  assert.equal(await inspector(page).getByRole('button', { name: 'Move Welcome left' }).isDisabled(), true)
  await pause()
  await shot('2-disabled-bounds')

  log('3. Add a component to a chosen section: the card is revealed and its properties open')
  await page.setViewportSize({ width: 1440, height: 640 })
  await pause(500)
  await toolbar.getByRole('button', { name: 'Add component' }).click()
  await library(page).getByLabel('Add to section').selectOption({ label: 'Reference · stack' })
  await pause()
  await shot('3-add-dialog')
  await library(page).getByRole('button', { name: 'Add Tasks', exact: true }).click()
  await library(page).waitFor({ state: 'hidden' })
  await pause(1200)
  await shot('3-add-revealed')
  await page.setViewportSize({ width: 1440, height: 900 })

  log('4. a palette fills the whole workspace: stage, navigation and cards; the editor keeps its own colors')
  await goTo(page, 'Appearance')
  await inspector(page).getByRole('button', { name: 'Use Midnight palette' }).click()
  await pause(900)
  await shot('4-palette-midnight')
  await inspector(page).getByRole('button', { name: 'Use Sunset palette' }).click()
  await pause(900)
  await shot('4-palette-sunset')

  log('5. the template gallery')
  await toolbar.getByRole('button', { name: 'Templates' }).click()
  await templates(page).getByRole('radio', { name: /Creative/ }).check()
  await pause(900)
  await shot('5-template-gallery')
  await page.keyboard.press('Escape')
  await pause(400)

  await context.close()
  const video = readdirSync(out).find((f) => f.endsWith('.webm'))
  if (video) renameSync(`${out}${video}`, `${out}management-demo.webm`)
  console.log(`OK: demo recorded in ${out}`)
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
