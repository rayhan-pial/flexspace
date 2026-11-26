// Real-browser, real-backend check of UI-027: the inspector hides and shows (1024/1280/1440) with a visibly
// wider canvas, without losing selection, view, draft or scroll and without any write or geometry change; toolbar
// Add component / Templates and Back to properties work; the toggle is unavailable mid-drag. Saves screenshots to
// artifacts/ui-review/after/. Not part of `npm test`. Same prerequisites as grid-gesture.mjs.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { goTo, inspector, library, templates } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'
const out = new URL('../../artifacts/ui-review/after/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
const writes = []
page.on('request', (r) => {
  if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`)
})
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const toolbar = page.locator('[data-toolbar]')
const canvasWidth = async () => (await page.locator('#workspace-canvas').boundingBox()).width
const widgetRects = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.react-grid-item:not(.react-grid-placeholder) [data-widget-id]')].map((e) => [e.getAttribute('data-widget-id'), Math.round(e.getBoundingClientRect().width / 8)])))
const serverConfig = async () => JSON.stringify((await page.evaluate(async () => (await fetch('/api/workspace')).json())).config)

try {
  log('register: three areas (rail, canvas, inspector) are present')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  const saved = await serverConfig()

  for (const [width, inspectorWidth] of [[1024, 280], [1280, 304], [1440, 304]]) {
    log(`${width}px: hide the inspector with a dirty draft; the canvas is visibly wider and nothing is written`)
    await page.setViewportSize({ width, height: 800 })
    await page.waitForTimeout(700)
    await page.getByLabel('Workspace title').fill(`Dirty at ${width}`)
    await goTo(page, 'Appearance')
    const before = { canvas: await canvasWidth(), rects: await widgetRects() }
    assert.equal(Math.round((await inspector(page).boundingBox()).width), inspectorWidth)
    writes.length = 0
    await toolbar.getByRole('button', { name: 'Hide inspector' }).click()
    await inspector(page).waitFor({ state: 'hidden' })
    await page.waitForTimeout(1500) // the grid re-measures after a width change
    const after = { canvas: await canvasWidth(), rects: await widgetRects() }
    assert.ok(after.canvas >= before.canvas + inspectorWidth, `the canvas grew by at least the inspector (${before.canvas} -> ${after.canvas})`)
    assert.ok(Object.keys(after.rects).every((id) => after.rects[id] >= before.rects[id]), 'cards were re-measured wider, not changed')
    assert.equal(await status(), 'Unsaved changes')
    assert.deepEqual(writes, [], 'hiding the inspector wrote nothing')
    assert.equal(await serverConfig(), saved, 'the stored workspace is untouched')
    await page.screenshot({ path: `${out}ui027-inspector-hidden-${width}.png` })
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Show inspector', 'focus stays on the toggle')
    await toolbar.getByRole('button', { name: 'Show inspector' }).click()
    await inspector(page).getByRole('heading', { name: 'Appearance' }).waitFor()
    await page.waitForTimeout(1200)
    assert.equal(Math.round(await canvasWidth()), Math.round(before.canvas), 'the canvas returned to its width')
    assert.equal(await page.getByLabel('Workspace title').inputValue(), `Dirty at ${width}`, 'the unsaved draft is intact')
    assert.deepEqual(writes, [])
  }

  log('the inspector keeps its scroll position across hide and show')
  await page.setViewportSize({ width: 1440, height: 520 })
  await page.waitForTimeout(500)
  await goTo(page, 'Appearance')
  await inspector(page).evaluate((el) => { el.scrollTop = 200 })
  const scrolled = await inspector(page).evaluate((el) => el.scrollTop)
  assert.ok(scrolled > 50, `the Appearance view is taller than the window (scrollTop ${scrolled})`)
  await toolbar.getByRole('button', { name: 'Hide inspector' }).click()
  await toolbar.getByRole('button', { name: 'Show inspector' }).click()
  await inspector(page).waitFor()
  assert.equal(await inspector(page).evaluate((el) => el.scrollTop), scrolled, 'scroll position restored')

  log('selection survives hide and show, and Back to properties returns from Appearance')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('article', { name: 'Tasks' }).click({ position: { x: 60, y: 12 } })
  await inspector(page).getByRole('heading', { name: 'Properties' }).waitFor()
  await goTo(page, 'Appearance')
  await toolbar.getByRole('button', { name: 'Hide inspector' }).click()
  await page.getByRole('article', { name: 'Tasks' }).locator('[data-selected-label]').waitFor()
  await toolbar.getByRole('button', { name: 'Show inspector' }).click()
  await inspector(page).getByRole('button', { name: 'Back to properties' }).click()
  await inspector(page).getByRole('heading', { name: 'Properties' }).waitFor()
  await inspector(page).getByRole('heading', { name: 'Tasks', level: 3 }).waitFor()

  log('clicking the already selected card on the canvas brings its Properties back from the Outline')
  await goTo(page, 'Outline')
  await page.getByRole('article', { name: 'Tasks' }).click({ position: { x: 60, y: 12 } })
  await inspector(page).getByRole('heading', { name: 'Properties' }).waitFor()

  log('toolbar: Add component and Templates open their dialogs; Escape returns focus to the toolbar button')
  await toolbar.getByRole('button', { name: 'Add component' }).click()
  await library(page).waitFor()
  await page.keyboard.press('Escape')
  await library(page).waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Add component')
  await toolbar.getByRole('button', { name: 'Templates' }).click()
  await templates(page).waitFor()
  await page.keyboard.press('Escape')
  await templates(page).waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Templates')

  log('mid-drag the toggle is unavailable, and releasing re-enables it; the canvas gesture is unaffected')
  const handle = await page.getByRole('article', { name: 'Notes' }).getByRole('heading', { level: 3 }).boundingBox()
  const at = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(at.x + 5, at.y + 5, { steps: 2 })
  await page.mouse.move(at.x - 150, at.y + 60, { steps: 10 })
  await page.waitForTimeout(250)
  assert.equal(await toolbar.getByRole('button', { name: 'Hide inspector' }).isDisabled(), true, 'unavailable while dragging')
  await page.keyboard.press('Escape') // abandon the drag
  await page.mouse.up()
  await page.waitForTimeout(300)
  assert.equal(await toolbar.getByRole('button', { name: 'Hide inspector' }).isEnabled(), true, 'available again after the gesture')

  log('Preview has no builder chrome: no rail, inspector, toggle, Add or Templates')
  await toolbar.getByRole('button', { name: 'Preview', exact: true }).click()
  assert.equal(await page.getByRole('complementary', { name: 'Inspector' }).count(), 0)
  assert.equal(await toolbar.getByRole('button', { name: /inspector|Add component|Templates/ }).count(), 0)
  assert.equal(await page.getByRole('navigation', { name: 'Editor navigation' }).count(), 0)

  console.log(`OK: inspector hide/show, toolbar entries and Back to properties (screenshots in ${out})`)
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
